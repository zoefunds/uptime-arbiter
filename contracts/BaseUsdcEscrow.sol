// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 interface. Base Sepolia USDC has 6 decimals.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title BaseUsdcEscrow
/// @notice Custodies all SLA capital exclusively as Base Sepolia USDC.
/// @dev GenLayer never receives funds. Its adjudication is relayed here by
///      `adjudicationRelayer`, which can only settle a pre-existing agreement.
contract BaseUsdcEscrow {
    address public constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint8 public constant USDC_DECIMALS = 6;

    enum Status { Proposed, Active, Settled, Cancelled, Expired }

    struct Agreement {
        address provider;
        address customer;
        uint128 escrowUsdc;
        uint128 customerBondUsdc;
        uint128 providerDeposited;
        uint128 customerDeposited;
        uint64 registrationDeadline;
        uint64 termEnd;
        Status status;
    }

    IERC20 public immutable usdc;
    address public owner;
    address public adjudicationRelayer;
    uint256 public nextAgreementId = 1;
    mapping(uint256 => Agreement) public agreements;

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidState();
    error DeadlinePassed();
    error TransferFailed();

    event AgreementProposed(uint256 indexed agreementId, address indexed provider, address indexed customer, uint256 escrowUsdc, uint256 customerBondUsdc, uint64 registrationDeadline, uint64 termEnd);
    event Funded(uint256 indexed agreementId, address indexed party, uint256 amount, bool activated);
    event AdjudicationRelayed(uint256 indexed agreementId, bytes32 indexed genlayerClaimId, uint256 customerPayoutUsdc, uint256 providerRefundUsdc, string verdict);
    event AgreementCancelled(uint256 indexed agreementId, Status status);
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);

    constructor(address initialRelayer) {
        if (initialRelayer == address(0)) revert InvalidAddress();
        usdc = IERC20(BASE_SEPOLIA_USDC);
        owner = msg.sender;
        adjudicationRelayer = initialRelayer;
    }

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier onlyRelayer() { if (msg.sender != adjudicationRelayer) revert Unauthorized(); _; }

    function setAdjudicationRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert InvalidAddress();
        emit RelayerUpdated(adjudicationRelayer, newRelayer);
        adjudicationRelayer = newRelayer;
    }

    function propose(address customer, uint128 escrowUsdc, uint128 customerBondUsdc, uint64 registrationDeadline, uint64 termEnd) external returns (uint256 agreementId) {
        if (customer == address(0) || customer == msg.sender) revert InvalidAddress();
        if (escrowUsdc == 0 || registrationDeadline <= block.timestamp || termEnd <= registrationDeadline) revert InvalidAmount();
        agreementId = nextAgreementId++;
        agreements[agreementId] = Agreement(msg.sender, customer, escrowUsdc, customerBondUsdc, 0, 0, registrationDeadline, termEnd, Status.Proposed);
        emit AgreementProposed(agreementId, msg.sender, customer, escrowUsdc, customerBondUsdc, registrationDeadline, termEnd);
    }

    function fundProvider(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Proposed || msg.sender != a.provider || block.timestamp > a.registrationDeadline) revert InvalidState();
        if (a.providerDeposited != 0) revert InvalidState();
        _pull(msg.sender, a.escrowUsdc);
        a.providerDeposited = a.escrowUsdc;
        _activateIfReady(agreementId, a);
    }

    function fundCustomer(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Proposed || msg.sender != a.customer || block.timestamp > a.registrationDeadline) revert InvalidState();
        if (a.customerDeposited != 0) revert InvalidState();
        _pull(msg.sender, a.customerBondUsdc);
        a.customerDeposited = a.customerBondUsdc;
        _activateIfReady(agreementId, a);
    }

    /// @notice Applies an already-final GenLayer adjudication. Amounts must
    /// sum to all held USDC, preventing a relayer from creating a payout.
    function relayAdjudication(uint256 agreementId, bytes32 genlayerClaimId, uint128 customerPayoutUsdc, uint128 providerRefundUsdc, string calldata verdict) external onlyRelayer {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Active || block.timestamp > a.termEnd) revert InvalidState();
        uint256 held = uint256(a.providerDeposited) + a.customerDeposited;
        if (uint256(customerPayoutUsdc) + providerRefundUsdc != held) revert InvalidAmount();
        a.status = Status.Settled;
        if (customerPayoutUsdc != 0) _push(a.customer, customerPayoutUsdc);
        if (providerRefundUsdc != 0) _push(a.provider, providerRefundUsdc);
        emit AdjudicationRelayed(agreementId, genlayerClaimId, customerPayoutUsdc, providerRefundUsdc, verdict);
    }

    function cancelOrReclaim(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Proposed) revert InvalidState();
        if (msg.sender != a.provider && msg.sender != a.customer && block.timestamp <= a.registrationDeadline) revert Unauthorized();
        a.status = Status.Cancelled;
        if (a.providerDeposited != 0) _push(a.provider, a.providerDeposited);
        if (a.customerDeposited != 0) _push(a.customer, a.customerDeposited);
        emit AgreementCancelled(agreementId, Status.Cancelled);
    }

    function expire(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Active || block.timestamp <= a.termEnd) revert InvalidState();
        a.status = Status.Expired;
        _push(a.provider, a.providerDeposited);
        if (a.customerDeposited != 0) _push(a.customer, a.customerDeposited);
        emit AgreementCancelled(agreementId, Status.Expired);
    }

    function _activateIfReady(uint256 agreementId, Agreement storage a) private {
        bool active = a.providerDeposited == a.escrowUsdc && a.customerDeposited == a.customerBondUsdc;
        if (active) a.status = Status.Active;
        emit Funded(agreementId, msg.sender, msg.sender == a.provider ? a.escrowUsdc : a.customerBondUsdc, active);
    }

    function _pull(address from, uint256 amount) private { if (!usdc.transferFrom(from, address(this), amount)) revert TransferFailed(); }
    function _push(address to, uint256 amount) private { if (!usdc.transfer(to, amount)) revert TransferFailed(); }
}
