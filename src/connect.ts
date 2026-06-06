import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const provider = new ethers.JsonRpcProvider(
        process.env.RPC_URL
    );

    const blockNumber = await provider.getBlockNumber();

    console.log("Connected Successfully");
    console.log("Latest Block:", blockNumber);
}

main().catch(console.error);
