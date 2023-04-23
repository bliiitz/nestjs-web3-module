"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVMLogsTransport = void 0;
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("@nestjs/common");
const ethers_1 = require("ethers");
class EVMLogsTransport extends microservices_1.Server {
    constructor(config, ctx) {
        super();
        this.logger = new common_1.Logger('EVMLogIndexer');
        this.config = config;
        this.rpc = new ethers_1.JsonRpcProvider(this.config.evmRpc);
        this.ctx = ctx;
    }
    async listen(callback) {
        this.logger.log("Loading current state...");
        const handler = this.messageHandlers.get('getSyncState');
        this.status = await handler(undefined, this.ctx);
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
        console.log("currentBlock: ", this.status.block);
        console.log("filter: ", filter);
        var logs = await this.rpc.getLogs(filter);
        for (const log of logs) {
            await this.parseLogs(log);
        }
    }
    async syncToCurrentBlock(currentBlock) {
        let loop = 0;
        try {
            for (let blockNumber = this.status.block + 1; blockNumber < currentBlock; blockNumber += this.config.blockBatchAmount) {
                loop += 1;
                let toBlock = blockNumber + this.config.blockBatchAmount;
                if (toBlock >= currentBlock)
                    toBlock = currentBlock;
                this.logger.log(`Parsing from block ${blockNumber} to ${toBlock}, current block: ${currentBlock}, remaining blocks: ${currentBlock - blockNumber})`);
                var filter = {
                    fromBlock: blockNumber,
                    toBlock
                };
                var logs = await this.rpc.getLogs(filter);
                console.log("logs length: ", logs.length);
                let actualBlock = blockNumber;
                const blockParsingEndedHandler = this.messageHandlers.get("blockParsingEnded");
                for (const log of logs) {
                    console.log("log.block:", log.blockNumber);
                    console.log("actualBlock:", actualBlock);
                    if (log.blockNumber > actualBlock) {
                        if (blockParsingEndedHandler !== undefined)
                            await blockParsingEndedHandler({ block: log.blockNumber - 1 }, this.ctx);
                        actualBlock = blockNumber;
                    }
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
        console.log(log);
        for (const contract of this.config.contracts) {
            if (log.address.toLowerCase() !== contract.address.toLowerCase())
                continue;
            await this.handleLog(contract, log);
            return;
        }
        for (const contract of this.config.dynamicContracts) {
            let getDynamicContractList = this.messageHandlers.get(`${contract.name}:List`);
            let addresses = await getDynamicContractList(undefined, this.ctx);
            for (const address of addresses) {
                if (log.address.toLowerCase() !== address.toLowerCase())
                    continue;
                await this.handleLog(contract, log);
                return;
            }
        }
    }
    async handleLog(contract, log) {
        let topics = log.topics.join(',').split(',');
        let iface = new ethers_1.Interface(contract.abi);
        let logParsed = iface.parseLog({ topics: topics, data: log.data });
        if (logParsed == null) {
            this.logger.warn(`Event with topic ${topics[0]} not found on ${contract.name}...`);
            return;
        }
        try {
            this.logger.debug(`Call handler for: ${contract.name}:${logParsed.name}`);
            const logHandler = this.messageHandlers.get(`${contract.name}:${logParsed.name}`);
            await logHandler({ address: log.address, log: logParsed }, this.ctx);
        }
        catch (error) {
            this.logger.warn(`${contract.name}:${logParsed.name} handler not found...`);
        }
    }
    async saveState() {
        const handler = this.messageHandlers.get('setSyncState');
        await handler(this.status, this.ctx);
    }
}
exports.EVMLogsTransport = EVMLogsTransport;
//# sourceMappingURL=evm-logs.transport.js.map