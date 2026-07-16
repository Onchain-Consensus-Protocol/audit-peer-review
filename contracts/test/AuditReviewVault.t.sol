// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/AuditReviewVault.sol";

contract AuditReviewTestToken is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeAuditReviewTestToken is AuditReviewTestToken {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > 1) {
            super._update(from, to, value - 1);
            super._update(from, address(0), 1);
        } else {
            super._update(from, to, value);
        }
    }
}

contract AuditReviewVaultTest is Test {
    AuditReviewTestToken internal token;
    AuditReviewVault internal vault;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);

    uint256 internal constant USDC = 1_000_000;
    uint256 internal constant MIN = USDC;

    event ReviewSubmitted(
        address indexed reviewer, IAuditReviewVault.Side indexed side, bytes32 indexed reviewHash, string review
    );

    function setUp() public {
        token = new AuditReviewTestToken();
        vault = new AuditReviewVault(address(this), address(token), block.timestamp + 1 days, MIN);
        token.mint(alice, 10_000 * USDC);
        token.mint(bob, 10_000 * USDC);
        token.mint(carol, 10_000 * USDC);
    }

    function _review(uint256 length) internal pure returns (string memory) {
        return string(new bytes(length));
    }

    function _approve(address user) internal {
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
    }

    function _firstStake(address user, IAuditReviewVault.Side side, uint256 amount) internal {
        _approve(user);
        vm.prank(user);
        vault.stakeWithReview(side, amount, _review(200));
    }

    function _newVault() internal returns (AuditReviewVault fresh) {
        fresh = new AuditReviewVault(address(this), address(token), block.timestamp + 1 days, MIN);
    }

    function _firstStakeOn(AuditReviewVault target, address user, IAuditReviewVault.Side side, uint256 amount) internal {
        vm.prank(user);
        token.approve(address(target), type(uint256).max);
        vm.prank(user);
        target.stakeWithReview(side, amount, _review(200));
    }

    function test_firstStakeStoresImmutableReviewIdentityAndEmitsBody() public {
        string memory review = _review(200);
        bytes32 reviewHash = keccak256(bytes(review));
        _approve(alice);

        vm.expectEmit(true, true, true, true, address(vault));
        emit ReviewSubmitted(alice, IAuditReviewVault.Side.NO, reviewHash, review);
        vm.prank(alice);
        vault.stakeWithReview(IAuditReviewVault.Side.NO, 10 * USDC, review);

        assertTrue(vault.hasReview(alice));
        assertEq(vault.reviewHashOf(alice), reviewHash);
        assertEq(uint256(vault.reviewSideOf(alice)), uint256(IAuditReviewVault.Side.NO));
        assertEq(vault.totalStakeNo(), 10 * USDC);
        (uint256 yes, uint256 no, uint256 invalid) = vault.stakeOf(alice);
        assertEq(yes, 0);
        assertEq(no, 10 * USDC);
        assertEq(invalid, 0);
    }

    function test_plainStakeCannotCreateOrAddPosition() public {
        _approve(alice);
        vm.prank(alice);
        vm.expectRevert("Use stakeWithReview or addStake");
        vault.stake(IAuditReviewVault.Side.YES, MIN);

        _firstStake(alice, IAuditReviewVault.Side.YES, MIN);
        vm.prank(alice);
        vm.expectRevert("Use stakeWithReview or addStake");
        vault.stake(IAuditReviewVault.Side.YES, MIN);
    }

    function test_donateSelectorDoesNotExist() public {
        (bool success,) = address(vault).call(abi.encodeWithSignature("donate(uint256)", MIN));
        assertFalse(success);
    }

    function test_addStakeRequiresReviewAndAutomaticallyUsesLockedSide() public {
        _approve(alice);
        vm.prank(alice);
        vm.expectRevert("Review required for first stake");
        vault.addStake(MIN);

        _firstStake(alice, IAuditReviewVault.Side.INVALID, 2 * USDC);
        vm.prank(alice);
        vault.addStake(3 * USDC);

        assertEq(vault.totalStakeInvalid(), 5 * USDC);
        assertEq(vault.totalPrincipal(), 5 * USDC);
        (IAuditReviewVault.Side side, bool hasPosition) = vault.sideOf(alice);
        assertTrue(hasPosition);
        assertEq(uint256(side), uint256(IAuditReviewVault.Side.INVALID));
    }

    function test_reviewCanOnlyBeSubmittedOnce() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, MIN);
        vm.prank(alice);
        vm.expectRevert("Review already submitted");
        vault.stakeWithReview(IAuditReviewVault.Side.NO, MIN, _review(200));
        assertEq(vault.totalStakeYes(), MIN);
        assertEq(vault.totalStakeNo(), 0);
    }

    function test_reviewByteBoundsAreInclusiveAndFailuresRollback() public {
        _approve(alice);
        vm.prank(alice);
        vm.expectRevert("Review too short");
        vault.stakeWithReview(IAuditReviewVault.Side.YES, MIN, _review(199));
        assertFalse(vault.hasReview(alice));
        assertEq(vault.totalPrincipal(), 0);

        vm.prank(alice);
        vault.stakeWithReview(IAuditReviewVault.Side.YES, MIN, _review(200));

        _approve(bob);
        vm.prank(bob);
        vault.stakeWithReview(IAuditReviewVault.Side.NO, MIN, _review(4096));

        _approve(carol);
        vm.prank(carol);
        vm.expectRevert("Review too long");
        vault.stakeWithReview(IAuditReviewVault.Side.INVALID, MIN, _review(4097));
        assertFalse(vault.hasReview(carol));
    }

    function test_transferFailureRollsBackReviewState() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.stakeWithReview(IAuditReviewVault.Side.YES, MIN, _review(200));
        assertFalse(vault.hasReview(alice));
        assertEq(vault.reviewHashOf(alice), bytes32(0));
        assertEq(vault.totalPrincipal(), 0);
    }

    function test_deadlineAndMinimumStakeStillApplyToFirstAndAdditionalStake() public {
        _approve(alice);
        vm.prank(alice);
        vm.expectRevert("Amount below min stake");
        vault.stakeWithReview(IAuditReviewVault.Side.YES, MIN - 1, _review(200));
        assertFalse(vault.hasReview(alice));

        _firstStake(alice, IAuditReviewVault.Side.YES, MIN);
        vm.warp(vault.resolutionTime());
        vm.prank(alice);
        vm.expectRevert("Staking ended");
        vault.addStake(MIN);
    }

    function test_settlementMatchesOCPRulesAfterAdditionalStake() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, 4 * USDC);
        vm.prank(alice);
        vault.addStake(2 * USDC);
        _firstStake(bob, IAuditReviewVault.Side.NO, 3 * USDC);
        _firstStake(carol, IAuditReviewVault.Side.INVALID, MIN);

        assertEq(vault.totalPrincipal(), 10 * USDC);
        assertEq(vault.totalStakeYes() + vault.totalStakeNo() + vault.totalStakeInvalid(), 10 * USDC);

        vm.warp(vault.resolutionTime());
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IAuditReviewVault.Outcome.YES));

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, 10 * USDC);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.remainingEligibleClaims(), 0);
    }

    function test_exactlyHalfStillFinalizesInvalid() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, 5 * USDC);
        _firstStake(bob, IAuditReviewVault.Side.NO, 4 * USDC);
        _firstStake(carol, IAuditReviewVault.Side.INVALID, MIN);
        vm.warp(vault.resolutionTime());
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IAuditReviewVault.Outcome.INVALID));
    }

    function test_feeOnTransferStakeRevertsWithoutAccounting() public {
        FeeAuditReviewTestToken feeToken = new FeeAuditReviewTestToken();
        AuditReviewVault feeVault =
            new AuditReviewVault(address(this), address(feeToken), block.timestamp + 1 days, MIN);
        feeToken.mint(alice, 10 * USDC);
        vm.prank(alice);
        feeToken.approve(address(feeVault), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert("Unexpected token transfer");
        feeVault.stakeWithReview(IAuditReviewVault.Side.YES, MIN, _review(200));
        assertFalse(feeVault.hasReview(alice));
        assertEq(feeVault.totalPrincipal(), 0);
        assertEq(feeToken.balanceOf(address(feeVault)), 0);
    }

    function test_preFinalizeSurplusIsConservedInsideSettlementSnapshot() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, USDC);
        _firstStake(bob, IAuditReviewVault.Side.YES, USDC);
        _firstStake(carol, IAuditReviewVault.Side.NO, USDC);
        vm.prank(carol);
        token.transfer(address(vault), 1);

        vm.warp(vault.resolutionTime());
        vault.finalize();
        assertEq(vault.settlementPool(), 3 * USDC + 1);

        uint256 beforeAlice = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - beforeAlice, 1_500_000);

        uint256 beforeBob = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - beforeBob, 1_500_001);
        assertEq(vault.totalPaid(), vault.settlementPool());
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_postFinalizeTransferCannotChangePayoutSnapshot() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, USDC);
        _firstStake(bob, IAuditReviewVault.Side.YES, USDC);
        _firstStake(carol, IAuditReviewVault.Side.NO, USDC);
        vm.warp(vault.resolutionTime());
        vault.finalize();
        uint256 snapshot = vault.settlementPool();

        vm.prank(alice);
        vault.withdraw();
        uint256 bobBefore = token.balanceOf(bob);
        uint256 alicePayout = vault.totalPaid();
        vm.prank(carol);
        token.transfer(address(vault), 7);
        vm.prank(bob);
        vault.withdraw();

        assertEq(vault.totalPaid(), snapshot);
        assertEq(alicePayout + token.balanceOf(bob) - bobBefore, snapshot);
        assertEq(token.balanceOf(address(vault)), 7);
        assertEq(vault.remainingEligibleClaims(), 0);
    }

    function test_loserWithdrawDoesNotConsumeSettlementPool() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, 2 * USDC);
        _firstStake(bob, IAuditReviewVault.Side.NO, USDC);
        vm.warp(vault.resolutionTime());
        vault.finalize();
        uint256 remaining = vault.remainingEligibleClaims();

        uint256 beforeBob = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob), beforeBob);
        assertEq(vault.totalPaid(), 0);
        assertEq(vault.remainingEligibleClaims(), remaining);

        vm.prank(bob);
        vm.expectRevert("Already claimed");
        vault.withdraw();
    }

    function test_claimOrderMovesOnlyDustAndAlwaysConservesPool() public {
        AuditReviewVault first = _newVault();
        AuditReviewVault second = _newVault();
        _firstStakeOn(first, alice, IAuditReviewVault.Side.YES, 1_000_000);
        _firstStakeOn(first, bob, IAuditReviewVault.Side.YES, 1_000_001);
        _firstStakeOn(first, carol, IAuditReviewVault.Side.NO, 1_000_000);
        _firstStakeOn(second, alice, IAuditReviewVault.Side.YES, 1_000_000);
        _firstStakeOn(second, bob, IAuditReviewVault.Side.YES, 1_000_001);
        _firstStakeOn(second, carol, IAuditReviewVault.Side.NO, 1_000_000);
        vm.warp(first.resolutionTime());
        first.finalize();
        second.finalize();

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        first.withdraw();
        uint256 aliceFirst = token.balanceOf(alice) - aliceBefore;
        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        first.withdraw();
        uint256 bobLast = token.balanceOf(bob) - bobBefore;
        assertEq(aliceFirst, 1_499_999);
        assertEq(bobLast, 1_500_002);

        bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        second.withdraw();
        uint256 bobFirst = token.balanceOf(bob) - bobBefore;
        aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        second.withdraw();
        uint256 aliceLast = token.balanceOf(alice) - aliceBefore;
        assertEq(bobFirst, 1_500_001);
        assertEq(aliceLast, 1_500_000);
        assertEq(first.totalPaid(), first.settlementPool());
        assertEq(second.totalPaid(), second.settlementPool());
    }

    function test_invalidRefundsAllAccountsAndSurplusDust() public {
        _firstStake(alice, IAuditReviewVault.Side.YES, USDC);
        _firstStake(bob, IAuditReviewVault.Side.NO, USDC);
        _firstStake(carol, IAuditReviewVault.Side.INVALID, USDC);
        vm.prank(alice);
        token.transfer(address(vault), 1);
        vm.warp(vault.resolutionTime());
        vault.finalize();
        assertEq(uint256(vault.outcome()), uint256(IAuditReviewVault.Outcome.INVALID));

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, USDC);
        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw();
        assertEq(token.balanceOf(bob) - bobBefore, USDC);
        uint256 carolBefore = token.balanceOf(carol);
        vm.prank(carol);
        vault.withdraw();
        assertEq(token.balanceOf(carol) - carolBefore, USDC + 1);
        assertEq(vault.totalPaid(), vault.settlementPool());
    }

    function testFuzz_standardTokenSettlementConservesSnapshot(
        uint96 aliceRaw,
        uint96 bobRaw,
        uint96 loserRaw,
        uint16 preSurplus,
        uint16 postSurplus,
        bool aliceFirst
    ) public {
        uint256 aliceStake = bound(uint256(aliceRaw), USDC, 1_000 * USDC);
        uint256 bobStake = bound(uint256(bobRaw), USDC, 1_000 * USDC);
        uint256 loserStake = bound(uint256(loserRaw), USDC, aliceStake + bobStake - 1);
        _firstStake(alice, IAuditReviewVault.Side.YES, aliceStake);
        _firstStake(bob, IAuditReviewVault.Side.YES, bobStake);
        _firstStake(carol, IAuditReviewVault.Side.NO, loserStake);
        vm.prank(carol);
        token.transfer(address(vault), preSurplus);
        vm.warp(vault.resolutionTime());
        vault.finalize();
        uint256 snapshot = vault.settlementPool();

        address first = aliceFirst ? alice : bob;
        address last = aliceFirst ? bob : alice;
        uint256 beforeFirst = token.balanceOf(first);
        vm.prank(first);
        vault.withdraw();
        uint256 paidFirst = token.balanceOf(first) - beforeFirst;
        vm.prank(carol);
        token.transfer(address(vault), postSurplus);
        uint256 beforeLast = token.balanceOf(last);
        vm.prank(last);
        vault.withdraw();
        uint256 paidLast = token.balanceOf(last) - beforeLast;

        assertLe(vault.totalPaid(), snapshot);
        assertEq(paidFirst + paidLast, snapshot);
        assertEq(vault.totalPaid(), snapshot);
        assertEq(token.balanceOf(address(vault)), postSurplus);
    }
}
