// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title BaseUsdcEscrow
/// @notice Base Sepolia is the sole custody and settlement layer for Uptime Arbiter.
/// @custom:version 0.8.0
/// @dev GenLayer adjudicates evidence. A relayer may only propose a distribution.
/// Either SLA party can veto during SETTLEMENT_DELAY. A separately keyed ruling
/// verifier must then attest the authoritative GenLayer digest and allocation;
/// the dispute resolver may apply only that attestation. No single party,
/// relayer, resolver, or verifier can both invent and execute a distribution.
contract BaseUsdcEscrow {
    address public constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint8 public constant USDC_DECIMALS = 6;
    uint64 public constant SETTLEMENT_DELAY = 10 minutes;
    uint64 public constant DISPUTE_REVIEW_DELAY = 1 days;
    uint64 public constant RESOLVER_GRACE_PERIOD = 1 days;
    uint64 public constant DISPUTE_ABANDONMENT_DELAY = 30 days;

    // Append-only so existing lifecycle numeric values remain stable for
    // deployed-index compatibility. A veto is terminal for relay attempts on
    // this claim, but funds retain the bounded recovery path.
    enum Status { Proposed, Active, SettlementPending, Settled, Cancelled, Expired, Disputed }

    struct Agreement {
        address provider;
        address customer;
        uint128 escrowUsdc;
        uint128 customerBondUsdc;
        uint128 providerDeposited;
        uint128 customerDeposited;
        uint64 registrationDeadline;
        uint64 serviceEnd;
        uint64 claimDeadline;
        uint64 settlementDeadline;
        bool customerAccepted;
        bool claimOpen;
        bytes32 openClaimId;
        bytes32 termsHash;
        Status status;
    }

    struct PendingSettlement {
        bytes32 claimId;
        bytes32 rulingHash;
        uint128 customerPayoutUsdc;
        uint128 providerRefundUsdc;
        uint64 executeAfter;
        bool vetoed;
    }

    struct VerifiedRuling {
        bytes32 claimId;
        bytes32 rulingHash;
        uint128 customerPayoutUsdc;
        uint128 providerRefundUsdc;
        bool exists;
    }

    IERC20 public immutable usdc;
    address public owner;
    address public adjudicationRelayer;
    /// @dev Deliberately distinct operational roles. The verifier authenticates
    /// the finalized GenLayer result; the resolver can only apply that exact
    /// attestation. Role setters enforce separate on-chain wallets.
    address public disputeResolver;
    address public rulingVerifier;
    uint256 public nextAgreementId = 1;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => PendingSettlement) public pendingSettlements;
    mapping(bytes32 => bool) public consumedClaims;
    mapping(bytes32 => bool) public disputedClaims;
    mapping(bytes32 => bool) public disputeReauthorizedClaims;
    mapping(uint256 => uint64) public disputeOpenedAt;
    mapping(uint256 => VerifiedRuling) public verifiedDisputeRulings;
    mapping(uint256 => bool) public providerAbandonmentConsent;
    mapping(uint256 => bool) public customerAbandonmentConsent;

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidState();
    error DeadlinePassed();
    error DeadlineNotReached();
    error BindingMismatch();
    error TransferFailed();

    event AgreementProposed(uint256 indexed agreementId, address indexed provider, address indexed customer, uint256 escrowUsdc, uint256 customerBondUsdc, uint64 registrationDeadline, uint64 serviceEnd, uint64 claimDeadline, uint64 settlementDeadline, bytes32 termsHash);
    event Funded(uint256 indexed agreementId, address indexed party, uint256 amount, bool activated);
    event ClaimOpened(uint256 indexed agreementId, bytes32 indexed claimId, uint64 observedWindowEnd);
    event SettlementProposed(uint256 indexed agreementId, bytes32 indexed claimId, bytes32 indexed rulingHash, uint256 customerPayoutUsdc, uint256 providerRefundUsdc, uint64 executeAfter);
    event SettlementVetoed(uint256 indexed agreementId, bytes32 indexed claimId, address indexed party);
    event ClaimDisputed(uint256 indexed agreementId, bytes32 indexed claimId, address indexed party);
    event DisputeRulingReauthorized(uint256 indexed agreementId, bytes32 indexed claimId, address indexed resolver, uint64 executeAfter);
    event DisputeRulingVerified(uint256 indexed agreementId, bytes32 indexed claimId, bytes32 indexed rulingHash, uint256 customerPayoutUsdc, uint256 providerRefundUsdc);
    event DisputedProposalRejected(uint256 indexed agreementId, bytes32 indexed claimId, address indexed verifier);
    event DisputeAbandonmentConsent(uint256 indexed agreementId, address indexed party);
    event DisputeResolverUpdated(address indexed previousResolver, address indexed newResolver);
    event RulingVerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event AdjudicationExecuted(uint256 indexed agreementId, bytes32 indexed claimId, bytes32 indexed rulingHash, uint256 customerPayoutUsdc, uint256 providerRefundUsdc);
    event AgreementClosed(uint256 indexed agreementId, Status status);
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialRelayer, address initialDisputeResolver, address initialRulingVerifier) {
        if (!_rolesAreDistinct(msg.sender, initialRelayer, initialDisputeResolver, initialRulingVerifier)) revert InvalidAddress();
        usdc = IERC20(BASE_SEPOLIA_USDC);
        owner = msg.sender;
        adjudicationRelayer = initialRelayer;
        disputeResolver = initialDisputeResolver;
        rulingVerifier = initialRulingVerifier;
    }

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier onlyRelayer() { if (msg.sender != adjudicationRelayer) revert Unauthorized(); _; }
    modifier onlyDisputeResolver() { if (msg.sender != disputeResolver) revert Unauthorized(); _; }
    modifier onlyRulingVerifier() { if (msg.sender != rulingVerifier) revert Unauthorized(); _; }

    function transferOwnership(address newOwner) external onlyOwner {
        if (!_rolesAreDistinct(newOwner, adjudicationRelayer, disputeResolver, rulingVerifier)) revert InvalidAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setAdjudicationRelayer(address newRelayer) external onlyOwner {
        if (!_rolesAreDistinct(owner, newRelayer, disputeResolver, rulingVerifier)) revert InvalidAddress();
        emit RelayerUpdated(adjudicationRelayer, newRelayer);
        adjudicationRelayer = newRelayer;
    }

    function setDisputeResolver(address newResolver) external onlyOwner {
        if (!_rolesAreDistinct(owner, adjudicationRelayer, newResolver, rulingVerifier)) revert InvalidAddress();
        emit DisputeResolverUpdated(disputeResolver, newResolver);
        disputeResolver = newResolver;
    }

    function setRulingVerifier(address newVerifier) external onlyOwner {
        if (!_rolesAreDistinct(owner, adjudicationRelayer, disputeResolver, newVerifier)) revert InvalidAddress();
        emit RulingVerifierUpdated(rulingVerifier, newVerifier);
        rulingVerifier = newVerifier;
    }

    function propose(address customer, uint128 escrowUsdc, uint128 customerBondUsdc, uint64 registrationDeadline, uint64 serviceEnd, uint64 claimDeadline, uint64 settlementDeadline, bytes32 termsHash) external returns (uint256 agreementId) {
        if (customer == address(0) || customer == msg.sender) revert InvalidAddress();
        if (escrowUsdc == 0 || termsHash == bytes32(0)) revert InvalidAmount();
        if (registrationDeadline <= block.timestamp || serviceEnd <= registrationDeadline || claimDeadline <= serviceEnd || settlementDeadline <= claimDeadline) revert InvalidAmount();
        agreementId = nextAgreementId++;
        agreements[agreementId] = Agreement(msg.sender, customer, escrowUsdc, customerBondUsdc, 0, 0, registrationDeadline, serviceEnd, claimDeadline, settlementDeadline, false, false, bytes32(0), termsHash, Status.Proposed);
        emit AgreementProposed(agreementId, msg.sender, customer, escrowUsdc, customerBondUsdc, registrationDeadline, serviceEnd, claimDeadline, settlementDeadline, termsHash);
    }

    function fundProvider(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Proposed || msg.sender != a.provider || block.timestamp > a.registrationDeadline || a.providerDeposited != 0) revert InvalidState();
        _pull(msg.sender, a.escrowUsdc);
        a.providerDeposited = a.escrowUsdc;
        _activateIfReady(agreementId, a);
    }

    /// @notice Explicit acceptance is required even when customerBondUsdc is zero.
    function acceptAndFundCustomer(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Proposed || msg.sender != a.customer || block.timestamp > a.registrationDeadline || a.customerAccepted) revert InvalidState();
        a.customerAccepted = true;
        if (a.customerBondUsdc != 0) {
            _pull(msg.sender, a.customerBondUsdc);
            a.customerDeposited = a.customerBondUsdc;
        }
        _activateIfReady(agreementId, a);
    }

    /// @notice Locks funds against expiry while one timely GenLayer claim is unresolved.
    function openClaim(uint256 agreementId, bytes32 claimId, uint64 observedWindowEnd) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Active || msg.sender != a.customer) revert Unauthorized();
        if (claimId == bytes32(0) || a.claimOpen || consumedClaims[claimId]) revert InvalidState();
        if (block.timestamp > a.claimDeadline || observedWindowEnd > a.serviceEnd || observedWindowEnd > block.timestamp) revert DeadlinePassed();
        a.claimOpen = true;
        a.openClaimId = claimId;
        emit ClaimOpened(agreementId, claimId, observedWindowEnd);
    }

    /// @notice Commits a finalized GenLayer ruling to a delayed, vetoable settlement.
    function proposeAdjudication(uint256 agreementId, bytes32 claimId, bytes32 rulingHash, uint128 customerPayoutUsdc, uint128 providerRefundUsdc) external onlyRelayer {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Active || !a.claimOpen || a.openClaimId != claimId) revert BindingMismatch();
        // Never create a proposal which cannot survive its compulsory party
        // review window before the agreed settlement deadline.
        if (block.timestamp + SETTLEMENT_DELAY > a.settlementDeadline || consumedClaims[claimId] || disputedClaims[claimId] || rulingHash == bytes32(0)) revert InvalidState();
        uint256 held = uint256(a.providerDeposited) + a.customerDeposited;
        if (uint256(customerPayoutUsdc) + providerRefundUsdc != held) revert InvalidAmount();
        uint64 executeAfter = uint64(block.timestamp + SETTLEMENT_DELAY);
        pendingSettlements[agreementId] = PendingSettlement(claimId, rulingHash, customerPayoutUsdc, providerRefundUsdc, executeAfter, false);
        a.status = Status.SettlementPending;
        emit SettlementProposed(agreementId, claimId, rulingHash, customerPayoutUsdc, providerRefundUsdc, executeAfter);
    }

    function vetoSettlement(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        PendingSettlement storage p = pendingSettlements[agreementId];
        if (a.status != Status.SettlementPending || (msg.sender != a.provider && msg.sender != a.customer)) revert Unauthorized();
        // The first veto grants a bounded independent review. Once the
        // separate resolver has approved that exact frozen ruling, a second
        // unilateral veto cannot indefinitely prevent its execution.
        if (disputeReauthorizedClaims[p.claimId]) revert InvalidState();
        if (block.timestamp >= p.executeAfter) revert DeadlinePassed();
        bytes32 claimId = p.claimId;
        p.vetoed = true;
        // A party veto durably freezes this exact finalized claim. The relayer
        // cannot spin a new proposal; critically, expiry cannot refund the
        // provider's collateral and erase a valid customer penalty.
        disputedClaims[claimId] = true;
        disputeOpenedAt[agreementId] = uint64(block.timestamp);
        a.status = Status.Disputed;
        emit SettlementVetoed(agreementId, claimId, msg.sender);
        emit ClaimDisputed(agreementId, claimId, msg.sender);
    }

    /// @notice Authenticates the finalized GenLayer result for a disputed claim.
    /// The verifier may correct a compromised relayer's digest or allocation,
    /// but cannot change the claim or distribute more than the held USDC.
    function attestDisputeRuling(
        uint256 agreementId,
        bytes32 claimId,
        bytes32 rulingHash,
        uint128 customerPayoutUsdc,
        uint128 providerRefundUsdc
    ) external onlyRulingVerifier {
        Agreement storage a = agreements[agreementId];
        PendingSettlement storage p = pendingSettlements[agreementId];
        if (a.status != Status.Disputed || p.claimId == bytes32(0) || !p.vetoed) revert InvalidState();
        if (claimId != a.openClaimId || claimId != p.claimId || rulingHash == bytes32(0)) revert BindingMismatch();
        if (uint256(customerPayoutUsdc) + providerRefundUsdc != uint256(a.providerDeposited) + a.customerDeposited) revert InvalidAmount();
        verifiedDisputeRulings[agreementId] = VerifiedRuling(claimId, rulingHash, customerPayoutUsdc, providerRefundUsdc, true);
        emit DisputeRulingVerified(agreementId, claimId, rulingHash, customerPayoutUsdc, providerRefundUsdc);
    }

    /// @notice Rejects a relay proposal for which no valid finalized ruling
    /// exists. The original claim remains open; a correct proposal may still be
    /// submitted before its deadline, or normal expiry recovery may proceed.
    function rejectDisputedProposal(uint256 agreementId) external onlyRulingVerifier {
        Agreement storage a = agreements[agreementId];
        PendingSettlement storage p = pendingSettlements[agreementId];
        if (a.status != Status.Disputed || p.claimId == bytes32(0) || !p.vetoed) revert InvalidState();
        if (block.timestamp < uint256(disputeOpenedAt[agreementId]) + DISPUTE_REVIEW_DELAY) revert DeadlineNotReached();
        bytes32 claimId = p.claimId;
        disputedClaims[claimId] = false;
        delete pendingSettlements[agreementId];
        delete verifiedDisputeRulings[agreementId];
        delete disputeOpenedAt[agreementId];
        a.status = Status.Active;
        emit DisputedProposalRejected(agreementId, claimId, msg.sender);
    }

    /// @notice The resolver applies only the separately verified ruling.
    function resolveDisputedSettlement(uint256 agreementId) external onlyDisputeResolver {
        _applyVerifiedRuling(agreementId);
    }

    /// @notice If the resolver is unavailable, the verifier's already-recorded
    /// ruling becomes permissionlessly executable after a bounded grace period.
    function executeVerifiedDispute(uint256 agreementId) external {
        if (block.timestamp < uint256(disputeOpenedAt[agreementId]) + DISPUTE_REVIEW_DELAY + RESOLVER_GRACE_PERIOD) revert DeadlineNotReached();
        _applyVerifiedRuling(agreementId);
    }

    /// @notice Last-resort recovery if both authorities disappear. Neither a
    /// liable provider nor claimant can erase a ruling alone: both parties must
    /// consent, and only after a long public abandonment period.
    function consentToAbandonedDisputeRefund(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Disputed || block.timestamp < uint256(disputeOpenedAt[agreementId]) + DISPUTE_ABANDONMENT_DELAY) revert InvalidState();
        if (msg.sender == a.provider) providerAbandonmentConsent[agreementId] = true;
        else if (msg.sender == a.customer) customerAbandonmentConsent[agreementId] = true;
        else revert Unauthorized();
        emit DisputeAbandonmentConsent(agreementId, msg.sender);
        if (providerAbandonmentConsent[agreementId] && customerAbandonmentConsent[agreementId]) {
            bytes32 claimId = a.openClaimId;
            a.status = Status.Expired;
            a.claimOpen = false;
            consumedClaims[claimId] = true;
            delete pendingSettlements[agreementId];
            delete verifiedDisputeRulings[agreementId];
            _refundOriginalDeposits(a);
            emit AgreementClosed(agreementId, Status.Expired);
        }
    }

    function executeSettlement(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        PendingSettlement memory p = pendingSettlements[agreementId];
        if (a.status != Status.SettlementPending || p.vetoed || p.claimId == bytes32(0)) revert InvalidState();
        if (block.timestamp < p.executeAfter) revert DeadlineNotReached();
        // A review-authorized frozen ruling may finish after the original
        // settlement deadline; the deadline only prevents a *new* relayer
        // proposal from beginning too late.
        if (block.timestamp > a.settlementDeadline && !disputeReauthorizedClaims[p.claimId]) revert DeadlinePassed();
        a.status = Status.Settled;
        a.claimOpen = false;
        consumedClaims[p.claimId] = true;
        delete pendingSettlements[agreementId];
        if (p.customerPayoutUsdc != 0) _push(a.customer, p.customerPayoutUsdc);
        if (p.providerRefundUsdc != 0) _push(a.provider, p.providerRefundUsdc);
        emit AdjudicationExecuted(agreementId, p.claimId, p.rulingHash, p.customerPayoutUsdc, p.providerRefundUsdc);
    }

    function cancelOrReclaim(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        if (a.status != Status.Proposed) revert InvalidState();
        if (msg.sender != a.provider && msg.sender != a.customer && block.timestamp <= a.registrationDeadline) revert Unauthorized();
        a.status = Status.Cancelled;
        _refundOriginalDeposits(a);
        emit AgreementClosed(agreementId, Status.Cancelled);
    }

    /// @notice With no claim, unlock after claimDeadline. With a claim, preserve
    /// funds until settlementDeadline, then refund original deposits.
    function recoverExpired(uint256 agreementId) external {
        Agreement storage a = agreements[agreementId];
        // A unilateral veto cannot turn a finalized breach into an automatic
        // original-deposit refund. A disputed ruling remains escrowed until
        // the separate resolver re-authorizes that exact ruling.
        if (a.status != Status.Active && a.status != Status.SettlementPending) revert InvalidState();
        uint256 deadline = a.claimOpen ? a.settlementDeadline : a.claimDeadline;
        if (block.timestamp <= deadline) revert DeadlineNotReached();
        a.status = Status.Expired;
        if (a.openClaimId != bytes32(0)) consumedClaims[a.openClaimId] = true;
        delete pendingSettlements[agreementId];
        _refundOriginalDeposits(a);
        emit AgreementClosed(agreementId, Status.Expired);
    }

    function _activateIfReady(uint256 agreementId, Agreement storage a) private {
        bool active = a.providerDeposited == a.escrowUsdc && a.customerAccepted && a.customerDeposited == a.customerBondUsdc;
        if (active) a.status = Status.Active;
        emit Funded(agreementId, msg.sender, msg.sender == a.provider ? a.escrowUsdc : a.customerBondUsdc, active);
    }

    function _refundOriginalDeposits(Agreement storage a) private {
        uint128 providerAmount = a.providerDeposited;
        uint128 customerAmount = a.customerDeposited;
        a.providerDeposited = 0;
        a.customerDeposited = 0;
        if (providerAmount != 0) _push(a.provider, providerAmount);
        if (customerAmount != 0) _push(a.customer, customerAmount);
    }

    function _applyVerifiedRuling(uint256 agreementId) private {
        Agreement storage a = agreements[agreementId];
        PendingSettlement storage p = pendingSettlements[agreementId];
        VerifiedRuling memory verified = verifiedDisputeRulings[agreementId];
        if (a.status != Status.Disputed || p.claimId == bytes32(0) || !p.vetoed || !verified.exists) revert InvalidState();
        if (block.timestamp < uint256(disputeOpenedAt[agreementId]) + DISPUTE_REVIEW_DELAY) revert DeadlineNotReached();
        p.rulingHash = verified.rulingHash;
        p.customerPayoutUsdc = verified.customerPayoutUsdc;
        p.providerRefundUsdc = verified.providerRefundUsdc;
        p.vetoed = false;
        p.executeAfter = uint64(block.timestamp + SETTLEMENT_DELAY);
        disputeReauthorizedClaims[p.claimId] = true;
        a.status = Status.SettlementPending;
        emit DisputeRulingReauthorized(agreementId, p.claimId, msg.sender, p.executeAfter);
    }

    function _rolesAreDistinct(address roleOwner, address relayer, address resolver, address verifier) private pure returns (bool) {
        return roleOwner != address(0) && relayer != address(0) && resolver != address(0) && verifier != address(0)
            && roleOwner != relayer && roleOwner != resolver && roleOwner != verifier
            && relayer != resolver && relayer != verifier && resolver != verifier;
    }

    function _pull(address from, uint256 amount) private { if (!usdc.transferFrom(from, address(this), amount)) revert TransferFailed(); }
    function _push(address to, uint256 amount) private { if (!usdc.transfer(to, amount)) revert TransferFailed(); }
}
