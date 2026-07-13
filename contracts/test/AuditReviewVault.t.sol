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
}
