"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVMLogsTransport = void 0;
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("@nestjs/common");
const ethers_1 = require("ethers");
class EVMLogsTransport extends microservices_1.Server {
    constructor(config) {
        super();
        this.logger = new common_1.Logger('EVMLogTransport');
        this.config = config;
        this.rpc = new ethers_1.JsonRpcProvider(this.config.evmRpc);
    }
    async onMessage(messageChannel, ...args) {
        const handler = this.messageHandlers.get(messageChannel);
        if (handler) {
            this.logger.debug(`Process message ${messageChannel}`);
            const [ipcMainEventObject, payload] = args;
            return await handler(payload, {
                evt: ipcMainEventObject,
            });
        }
        this.logger.warn(`No handlers for message ${messageChannel}`);
    }
    async listen(callback) {
        this.logger.log("Loading current state...");
        const handler = this.messageHandlers.get('getSyncState');
        this.status = await handler(undefined);
        this.logger.log(`Start sync from block ${this.status.block}...`);
        let loops = 2;
        while (loops >= 2) {
            let currentBlock = await this.rpc.getBlockNumber();
            this.logger.log(`Current block number: ${currentBlock}`);
            loops = await this.syncToCurrentBlock(currentBlock);
        }
        this.rpc.on('block', (blockNumber) => this.onNewBlock(blockNumber));
        callback();
    }
    close() {
        this.rpc.removeAllListeners();
    }
    async onNewBlock(blockNumber) {
        this.logger.log(`Checking data of block #${blockNumber}`);
        var filter = {
            fromBlock: this.status.block + 1,
            toBlock: blockNumber
        };
        var logs = await this.rpc.getLogs(filter);
        for (const log of logs) {
            await this.parseLogs(log);
        }
    }
    async syncToCurrentBlock(currentBlock) {
        let loop = 0;
        try {
            this.logger.log("Synced block : ", this.status.block);
            this.logger.log("Current block: ", currentBlock);
            for (let blockNumber = this.status.block + 1; blockNumber < currentBlock; blockNumber += this.config.blockBatchAmount) {
                loop += 1;
                let toBlock = blockNumber + this.config.blockBatchAmount;
                this.logger.log(`Parsing from block ${blockNumber} to ${toBlock}, current block: ${currentBlock}, remaining blocks: ${currentBlock - blockNumber})`);
                if (toBlock >= currentBlock) {
                    toBlock = currentBlock;
                    blockNumber = currentBlock;
                }
                var filter = {
                    fromBlock: blockNumber,
                    toBlock
                };
                var logs = await this.rpc.getLogs(filter);
                for (const log of logs) {
                    await this.parseLogs(log);
                }
                this.status.block = toBlock;
                await this.saveState();
            }
        }
        catch (error) {
            console.error(error);
        }
        return loop;
    }
    async parseLogs(log) {
        for (const contract of this.config.contracts) {
            if (log.address.toLowerCase() !== contract.address.toLowerCase())
                continue;
            let topics = log.topics.join(',').split(',');
            let iface = new ethers_1.Interface(contract.abi);
            let logParsed = iface.parseLog({ topics: topics, data: log.data });
            const logHandler = this.messageHandlers.get(`${contract.name}:${logParsed.name}`);
            await logHandler(logParsed);
        }
    }
    async saveState() {
        const handler = this.messageHandlers.get('setSyncState');
        await handler(this.status);
    }
}
exports.EVMLogsTransport = EVMLogsTransport;
//# sourceMappingURL=evm-logs.transport.js.map