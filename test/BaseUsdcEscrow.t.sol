// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseUsdcEscrow} from "../contracts/BaseUsdcEscrow.sol";
import {MockUSDC} from "../contracts/test/MockUSDC.sol";

interface Vm {
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
    function etch(address target, bytes calldata code) external;
    function expectRevert(bytes4 selector) external;
}

contract BaseUsdcEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address private constant PROVIDER = address(0xA11CE);
    address private constant CUSTOMER = address(0xB0B);
    address private constant RELAYER = address(0xCAFE);
    address private constant DISPUTE_RESOLVER = address(0xD15);
    bytes32 private constant TERMS = keccak256("bound SLA terms");
    BaseUsdcEscrow private escrow;
    MockUSDC private usdc;

    function setUp() public {
        MockUSDC template = new MockUSDC();
        vm.etch(USDC, address(template).code);
        usdc = MockUSDC(USDC);
        escrow = new BaseUsdcEscrow(RELAYER, DISPUTE_RESOLVER);
        usdc.mint(PROVIDER, 100_000_000);
        usdc.mint(CUSTOMER, 100_000_000);
    }

    function testE2E_PartialBreachSettlesExactHeldBalance() public {
        (uint256 id,,,) = _activate(10_000_000, 2_000_000);
        bytes32 claimId = keccak256("claim-partial");
        _openClaim(id, claimId);
        vm.prank(RELAYER);
        // $7 penalty from the provider plus return of the customer's $2 bond.
        escrow.proposeAdjudication(id, claimId, keccak256("finalized-partial-ruling"), 9_000_000, 3_000_000);
        vm.warp(block.timestamp + escrow.SETTLEMENT_DELAY());
        escrow.executeSettlement(id);
        _eq(usdc.balanceOf(CUSTOMER), 107_000_000, "customer receives bond plus $7 penalty");
        _eq(usdc.balanceOf(PROVIDER), 93_000_000, "provider receives remaining $3 escrow");
        _eq(_status(id), uint8(BaseUsdcEscrow.Status.Settled), "agreement settled");
    }

    function testE2E_NoBreachReturnsEntireHeldBalanceToProvider() public {
        (uint256 id,,,) = _activate(10_000_000, 2_000_000);
        bytes32 claimId = keccak256("claim-no-breach");
        _openClaim(id, claimId);
        vm.prank(RELAYER);
        escrow.proposeAdjudication(id, claimId, keccak256("finalized-no-breach-ruling"), 2_000_000, 10_000_000);
        vm.warp(block.timestamp + escrow.SETTLEMENT_DELAY());
        escrow.executeSettlement(id);
        _eq(usdc.balanceOf(CUSTOMER), 100_000_000, "customer bond is returned");
        _eq(usdc.balanceOf(PROVIDER), 100_000_000, "provider escrow is returned");
        _eq(usdc.balanceOf(address(escrow)), 0, "escrow is fully cleared");
    }

    function testE2E_ExpiredAgreementRefundsBothAfterClaimDeadline() public {
        (uint256 id,, uint64 claimDeadline,) = _activate(10_000_000, 2_000_000);
        vm.warp(uint256(claimDeadline) + 1);
        escrow.recoverExpired(id);
        _eq(usdc.balanceOf(CUSTOMER), 100_000_000, "customer bond refunded");
        _eq(usdc.balanceOf(PROVIDER), 100_000_000, "provider escrow refunded");
        _eq(_status(id), uint8(BaseUsdcEscrow.Status.Expired), "agreement expired");
    }

    function testZeroBondStillRequiresCustomerAcceptance() public {
        (uint256 id,,,) = _propose(10_000_000, 0);
        vm.prank(PROVIDER);
        usdc.approve(address(escrow), 10_000_000);
        vm.prank(PROVIDER);
        escrow.fundProvider(id);
        _eq(_status(id), uint8(BaseUsdcEscrow.Status.Proposed), "provider cannot self-activate zero bond");
        vm.prank(CUSTOMER);
        escrow.acceptAndFundCustomer(id);
        _eq(_status(id), uint8(BaseUsdcEscrow.Status.Active), "explicit customer acceptance activates");
    }

    function testUnresolvedClaimBlocksEarlyExpiryButHasBoundedRecovery() public {
        (uint256 id,, uint64 claimDeadline, uint64 settlementDeadline) = _activate(10_000_000, 2_000_000);
        _openClaim(id, keccak256("unresolved"));
        vm.warp(uint256(claimDeadline) + 1);
        vm.expectRevert(BaseUsdcEscrow.DeadlineNotReached.selector);
        escrow.recoverExpired(id);
        vm.warp(uint256(settlementDeadline) + 1);
        escrow.recoverExpired(id);
        _eq(usdc.balanceOf(PROVIDER), 100_000_000, "provider bounded recovery");
        _eq(usdc.balanceOf(CUSTOMER), 100_000_000, "customer bounded recovery");
    }

    function testVetoFreezesClaimAndResolverReauthorizesExactPayout() public {
        (uint256 id,, uint64 claimDeadline, uint64 settlementDeadline) = _activate(10_000_000, 2_000_000);
        bytes32 claimId = keccak256("claim-veto");
        _openClaim(id, claimId);
        vm.prank(RELAYER);
        escrow.proposeAdjudication(id, claimId, keccak256("fabricated-ruling"), 12_000_000, 0);
        vm.prank(PROVIDER);
        escrow.vetoSettlement(id);
        vm.warp(block.timestamp + escrow.SETTLEMENT_DELAY());
        vm.expectRevert(BaseUsdcEscrow.InvalidState.selector);
        escrow.executeSettlement(id);
        _eq(_status(id), uint8(BaseUsdcEscrow.Status.Disputed), "veto creates durable disputed state");
        require(escrow.disputedClaims(claimId), "claim should be permanently relay-blocked after veto");
        vm.prank(RELAYER);
        vm.expectRevert(BaseUsdcEscrow.BindingMismatch.selector);
        escrow.proposeAdjudication(id, claimId, keccak256("second-ruling"), 2_000_000, 10_000_000);
        // A provider cannot convert a valid breach into a refund merely by
        // vetoing. The pre-veto exact payout remains stored and only the
        // separate resolver can re-authorize it after review.
        vm.warp(uint256(settlementDeadline) + 1);
        vm.expectRevert(BaseUsdcEscrow.InvalidState.selector);
        escrow.recoverExpired(id);
        vm.warp(block.timestamp + escrow.DISPUTE_REVIEW_DELAY());
        vm.prank(DISPUTE_RESOLVER);
        escrow.reauthorizeDisputedSettlement(id);
        vm.warp(block.timestamp + escrow.SETTLEMENT_DELAY());
        escrow.executeSettlement(id);
        _eq(usdc.balanceOf(CUSTOMER), 110_000_000, "legitimate vetoed payout remains enforceable");
        _eq(usdc.balanceOf(PROVIDER), 90_000_000, "provider receives only original ruling remainder");
        _eq(_status(id), uint8(BaseUsdcEscrow.Status.Settled), "resolver reauthorization settles exact frozen ruling");
    }

    function testProposalTooNearSettlementDeadlineIsRejected() public {
        (uint256 id,,, uint64 settlementDeadline) = _activate(10_000_000, 2_000_000);
        bytes32 claimId = keccak256("near-deadline");
        _openClaim(id, claimId);
        vm.warp(uint256(settlementDeadline) - escrow.SETTLEMENT_DELAY() + 1);
        vm.prank(RELAYER);
        vm.expectRevert(BaseUsdcEscrow.InvalidState.selector);
        escrow.proposeAdjudication(id, claimId, keccak256("late-ruling"), 2_000_000, 10_000_000);
    }

    function testRelayerCannotSettleDifferentClaim() public {
        (uint256 id,,,) = _activate(10_000_000, 2_000_000);
        _openClaim(id, keccak256("real-claim"));
        vm.prank(RELAYER);
        vm.expectRevert(BaseUsdcEscrow.BindingMismatch.selector);
        escrow.proposeAdjudication(id, keccak256("other-claim"), keccak256("ruling"), 1, 11_999_999);
    }

    function _openClaim(uint256 id, bytes32 claimId) private {
        vm.prank(CUSTOMER);
        escrow.openClaim(id, claimId, uint64(block.timestamp));
    }

    function _activate(uint128 providerEscrow, uint128 customerBond) private returns (uint256 id, uint64 serviceEnd, uint64 claimDeadline, uint64 settlementDeadline) {
        (id, serviceEnd, claimDeadline, settlementDeadline) = _propose(providerEscrow, customerBond);
        vm.prank(PROVIDER);
        usdc.approve(address(escrow), providerEscrow);
        vm.prank(PROVIDER);
        escrow.fundProvider(id);
        if (customerBond != 0) {
            vm.prank(CUSTOMER);
            usdc.approve(address(escrow), customerBond);
        }
        vm.prank(CUSTOMER);
        escrow.acceptAndFundCustomer(id);
    }

    function _propose(uint128 providerEscrow, uint128 customerBond) private returns (uint256 id, uint64 serviceEnd, uint64 claimDeadline, uint64 settlementDeadline) {
        uint64 registrationDeadline = uint64(block.timestamp + 1 days);
        serviceEnd = uint64(block.timestamp + 30 days);
        claimDeadline = uint64(block.timestamp + 32 days);
        settlementDeadline = uint64(block.timestamp + 40 days);
        vm.prank(PROVIDER);
        id = escrow.propose(CUSTOMER, providerEscrow, customerBond, registrationDeadline, serviceEnd, claimDeadline, settlementDeadline, TERMS);
    }

    function _eq(uint256 actual, uint256 expected, string memory message) private pure { require(actual == expected, message); }

    function _status(uint256 id) private view returns (uint256) {
        (,,,,,,,,,,,,,, BaseUsdcEscrow.Status status) = escrow.agreements(id);
        return uint8(status);
    }
}
