// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/AuditReviewVaultFactory.sol";

contract FactoryTestUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AuditReviewVaultFactoryTest is Test {
    FactoryTestUSDC internal token;
    AuditReviewVaultFactory internal factory;
    address internal alice = address(0xA11CE);
    uint256 internal constant USDC = 1_000_000;

    function setUp() public {
        token = new FactoryTestUSDC();
        factory = new AuditReviewVaultFactory(address(token), USDC, 10 * USDC);
        token.mint(alice, 1_000 * USDC);
        vm.prank(alice);
        token.approve(address(factory), type(uint256).max);
    }

    function _review() internal pure returns (string memory) {
        return string(new bytes(200));
    }

    function _create(uint256 deadline, uint256 initialNoStake) internal returns (address vault) {
        vm.prank(alice);
        vault = factory.createDispute(
            AuditReviewVaultFactory.CreateParams({
                auditUrl: "https://example.com/audit",
                findingLabel: "Finding #1",
                finding: "A disputed security finding",
                yesRule: "Finding is valid",
                noRule: "Finding is invalid",
                invalidRule: "Evidence is insufficient",
                resolutionTime: deadline,
                creatorReview: _review(),
                initialNoStake: initialNoStake
            })
        );
    }

    function test_permissionlessCreateAtomicallyBootstrapsCreatorNo() public {
        uint256 deadline = block.timestamp + 7 days;
        address vaultAddress = _create(deadline, 10 * USDC);
        AuditReviewVault vault = AuditReviewVault(vaultAddress);

        assertTrue(factory.isVault(vaultAddress));
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaultAt(0), vaultAddress);
        assertEq(vault.factory(), address(factory));
        assertEq(address(vault.stakeToken()), address(token));
        assertEq(vault.resolutionTime(), deadline);
        assertEq(vault.minStake(), USDC);
        assertTrue(vault.hasReview(alice));
        assertEq(uint256(vault.reviewSideOf(alice)), uint256(IAuditReviewVault.Side.NO));
        assertEq(vault.totalStakeNo(), 10 * USDC);
        assertEq(token.balanceOf(vaultAddress), 10 * USDC);

        AuditReviewVaultFactory.DisputeMeta memory meta = factory.getDisputeMeta(vaultAddress);
        assertEq(meta.creator, alice);
        assertEq(meta.findingLabel, "Finding #1");
        assertTrue(meta.claimHash != bytes32(0));
    }

    function test_duplicateClaimsAreAllowedAndIndexedSeparately() public {
        address first = _create(block.timestamp + 7 days, 10 * USDC);
        address second = _create(block.timestamp + 8 days, 10 * USDC);
        assertTrue(first != second);
        assertEq(factory.vaultCount(), 2);
        assertEq(factory.getDisputeMeta(first).claimHash, factory.getDisputeMeta(second).claimHash);
    }

    function test_creationBoundsRevertWithoutRegisteringVault() public {
        vm.expectRevert("Resolution time must be future");
        _create(block.timestamp, 10 * USDC);
        vm.expectRevert("Creator NO stake too low");
        _create(block.timestamp + 7 days, 10 * USDC - 1);
        assertEq(factory.vaultCount(), 0);
    }

    function test_canCreateWithOneSecondDeadline() public {
        address vaultAddress = _create(block.timestamp + 1, 10 * USDC);
        AuditReviewVault vault = AuditReviewVault(vaultAddress);
        assertEq(vault.resolutionTime(), block.timestamp + 1);
        assertEq(vault.totalStakeNo(), 10 * USDC);
    }

    function test_canCreateWithLongFutureDeadline() public {
        uint256 deadline = block.timestamp + 365 days;
        address vaultAddress = _create(deadline, 10 * USDC);
        AuditReviewVault vault = AuditReviewVault(vaultAddress);
        assertEq(vault.resolutionTime(), deadline);
    }

    function test_failedTransferRollsBackDeploymentAndRegistry() public {
        vm.startPrank(address(0xB0B));
        vm.expectRevert();
        factory.createDispute(
            AuditReviewVaultFactory.CreateParams({
                auditUrl: "https://example.com/audit",
                findingLabel: "Finding #1",
                finding: "Finding",
                yesRule: "YES",
                noRule: "NO",
                invalidRule: "INVALID",
                resolutionTime: block.timestamp + 7 days,
                creatorReview: _review(),
                initialNoStake: 10 * USDC
            })
        );
        vm.stopPrank();
        assertEq(factory.vaultCount(), 0);
    }

    function test_onlyFactoryCanBootstrap() public {
        AuditReviewVault vault = new AuditReviewVault(address(factory), address(token), block.timestamp + 7 days, USDC);
        token.mint(address(vault), 10 * USDC);
        vm.prank(alice);
        vm.expectRevert("Only factory");
        vault.bootstrapCreatorNo(alice, 10 * USDC, _review());
    }
}
