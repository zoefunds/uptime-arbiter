// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseUsdcEscrow} from "../contracts/BaseUsdcEscrow.sol";
import {MockUSDC} from "../contracts/test/MockUSDC.sol";

interface Vm {
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
    function etch(address target, bytes calldata code) external;
}

/// @notice End-to-end settlement tests. The production contract retains its
/// immutable Base Sepolia USDC address; tests install a local ERC-20 at that
/// exact address so the production bytecode and all transfer paths are used.
contract BaseUsdcEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address private constant PROVIDER = address(0xA11CE);
    address private constant CUSTOMER = address(0xB0B);
    address private constant RELAYER = address(0xCAFE);
    BaseUsdcEscrow private escrow;
    MockUSDC private usdc;

    function setUp() public {
        MockUSDC template = new MockUSDC();
        vm.etch(USDC, address(template).code);
        usdc = MockUSDC(USDC);
        escrow = new BaseUsdcEscrow(RELAYER);
        usdc.mint(PROVIDER, 100_000_000);
        usdc.mint(CUSTOMER, 100_000_000);
    }

    function testE2E_PartialBreachSettlesExactHeldBalance() public {
        uint256 id = _activate(10_000_000, 2_000_000);
        vm.prank(RELAYER);
        escrow.relayAdjudication(id, bytes32("claim-partial"), 7_000_000, 5_000_000, "RESOLVED_PARTIAL");
        _eq(usdc.balanceOf(CUSTOMER), 105_000_000, "customer receives $7 payout");
        _eq(usdc.balanceOf(PROVIDER), 95_000_000, "provider receives $5 refund");
        _eq(_status(id), 2, "agreement settled");
    }

    function testE2E_NoBreachReturnsEntireEscrowToProvider() public {
        uint256 id = _activate(10_000_000, 2_000_000);
        vm.prank(RELAYER);
        escrow.relayAdjudication(id, bytes32("claim-no-breach"), 0, 12_000_000, "RESOLVED_NO_BREACH");
        _eq(usdc.balanceOf(CUSTOMER), 98_000_000, "customer bond is applied to settlement");
        _eq(usdc.balanceOf(PROVIDER), 102_000_000, "provider receives all $12 held");
        _eq(usdc.balanceOf(address(escrow)), 0, "escrow is fully cleared");
    }

    function testE2E_ExpiredActiveAgreementRefundsBothParties() public {
        uint256 id = _activate(10_000_000, 2_000_000);
        vm.warp(block.timestamp + 31 days);
        escrow.expire(id);
        _eq(usdc.balanceOf(CUSTOMER), 100_000_000, "customer bond refunded");
        _eq(usdc.balanceOf(PROVIDER), 100_000_000, "provider escrow refunded");
        _eq(_status(id), 4, "agreement expired");
    }

    function _activate(uint128 providerEscrow, uint128 customerBond) private returns (uint256 id) {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint64 termEnd = uint64(block.timestamp + 30 days);
        vm.prank(PROVIDER);
        id = escrow.propose(CUSTOMER, providerEscrow, customerBond, deadline, termEnd);
        vm.prank(PROVIDER);
        usdc.approve(address(escrow), providerEscrow);
        vm.prank(CUSTOMER);
        usdc.approve(address(escrow), customerBond);
        vm.prank(PROVIDER);
        escrow.fundProvider(id);
        vm.prank(CUSTOMER);
        escrow.fundCustomer(id);
    }

    function _eq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _status(uint256 id) private view returns (uint256) {
        (,,,,,,,, BaseUsdcEscrow.Status status) = escrow.agreements(id);
        return uint8(status);
    }
}
