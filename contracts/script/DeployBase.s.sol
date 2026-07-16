// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../src/AuditReviewVaultFactory.sol";

contract DeployBase is Script {
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint256 internal constant MIN_STAKE = 1_000_000;
    uint256 internal constant MIN_CREATOR_NO_STAKE = 10_000_000;

    function run() external returns (AuditReviewVaultFactory factory) {
        require(block.chainid == 8453, "Base mainnet only");
        require(BASE_USDC.code.length > 0, "USDC not deployed");
        require(IERC20Metadata(BASE_USDC).decimals() == 6, "Unexpected USDC decimals");
        require(keccak256(bytes(IERC20Metadata(BASE_USDC).symbol())) == keccak256("USDC"), "Unexpected token");

        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        factory = new AuditReviewVaultFactory(BASE_USDC, MIN_STAKE, MIN_CREATOR_NO_STAKE);
        vm.stopBroadcast();

        require(address(factory.officialStakeToken()) == BASE_USDC, "Factory token mismatch");
        require(factory.minStake() == MIN_STAKE, "Factory min stake mismatch");
        require(factory.minCreatorNoStake() == MIN_CREATOR_NO_STAKE, "Factory creator stake mismatch");
        require(factory.auditReviewFactoryVersion() == 2, "Factory version mismatch");
    }
}
