"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVMLogsTransport = void 0;
const microservices_1 = require("@nestjs/microservices");
const bottleneck_1 = require("bottleneck");
const common_1 = require("@nestjs/common");
const ethers_1 = require("ethers");
class EVMLogsTransport extends microservices_1.Server {
    constructor(config, ctx) {
        super();
        this.logger = new common_1.Logger('EVMLogIndexer');
        this.limiter = new bottleneck_1.default({
            maxConcurrent: 1
        });
        this.config = config;
        this.rpc = new ethers_1.providers.JsonRpcProvider(this.config.evmRpc);
        this.ctx = ctx;
        this.limiter.on('error', function (error) {
            this.logger.error(error);
            process.exit(1);
        });
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
        this.rpc.on('block', (blockNumber) => this.limiter.schedule(() => this.onNewBlock(blockNumber)));
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
            await this.parseLog(log);
        }
    }
    async syncToCurrentBlock(currentBlock) {
        const blockParsingEndedHandler = this.messageHandlers.get("blockParsingEnded");
        let loop = 0;
        try {
            for (let blockNumber = this.status.block; blockNumber < currentBlock; blockNumber += this.config.blockBatchAmount) {
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
                let actualBlock = blockNumber;
                for (const log of logs) {
                    if (log.blockNumber > actualBlock) {
                        actualBlock = log.blockNumber;
                        if (blockParsingEndedHandler !== undefined)
                            await blockParsingEndedHandler({ block: actualBlock - 1 }, this.ctx);
                    }
                    if (log.logIndex <= this.status.logIndex && log.blockNumber == this.status.block)
                        continue;
                    await this.parseLog(log);
                }
                this.status.block = toBlock;
                this.status.logIndex = 1000000;
                await this.saveState();
            }
        }
        catch (error) {
            console.error(error);
        }
        if (blockParsingEndedHandler !== undefined)
            await blockParsingEndedHandler({ block: currentBlock }, this.ctx);
        return loop;
    }
    async parseLog(log) {
        for (const contract of this.config.contracts) {
            if (log.address.toLowerCase() !== contract.address.toLowerCase())
                continue;
            await this.handleLog(contract, log);
            this.status.block = log.blockNumber;
            this.status.logIndex = log.logIndex;
            await this.saveState();
            return;
        }
        for (const contract of this.config.dynamicContracts) {
            let getDynamicContractList = this.messageHandlers.get(`${contract.name}:List`);
            let addresses = await getDynamicContractList(undefined, this.ctx);
            for (const address of addresses) {
                if (log.address.toLowerCase() !== address.toLowerCase())
                    continue;
                await this.handleLog(contract, log);
                this.status.block = log.blockNumber;
                this.status.logIndex = log.logIndex;
                await this.saveState();
                return;
            }
        }
    }
    async handleLog(contract, log) {
        let topics = log.topics.join(',').split(',');
        let iface = new ethers_1.utils.Interface(contract.abi);
        let logParsed;
        try {
            logParsed = iface.parseLog({ topics: topics, data: log.data });
        }
        catch (_a) {
            this.logger.warn(`Event with topic ${topics[0]} not found on ${contract.name}...`);
            return;
        }
        const args = {};
        logParsed.eventFragment.inputs.forEach((input, index) => {
            args[input.name] = logParsed.args[index];
        });
        let evmLog = {
            address: log.address,
            blockNumber: log.blockNumber,
            index: log.logIndex,
            data: args
        };
        try {
            this.logger.debug(`Call handler for: ${contract.name}:${logParsed.name}`);
            const logHandler = this.messageHandlers.get(`${contract.name}:${logParsed.name}`);
            if (logHandler)
                await logHandler(evmLog, this.ctx);
            else
                this.logger.warn(`${contract.name}:${logParsed.name} handler not found...`);
        }
        catch (error) {
            this.logger.error(error);
            process.exit(1);
        }
    }
    async saveState() {
        const handler = this.messageHandlers.get('setSyncState');
        await handler(this.status, this.ctx);
    }
}
exports.EVMLogsTransport = EVMLogsTransport;
//# sourceMappingURL=evm-logs.transport.js.map