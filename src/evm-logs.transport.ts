import { CustomTransportStrategy, MessageHandler, Server } from '@nestjs/microservices';
import Bottleneck from "bottleneck";
import { Logger } from '@nestjs/common';
import { JsonRpcProvider, Log, Interface } from 'ethers';

export interface IndexerConfig {
    evmRpc: string
    startAtBlock: number
    blockBatchAmount: number
    contracts: ContractConfig[]
    dynamicContracts: DynamicContractConfig[]
}

export interface ContractConfig {
    name: string,
    address: string,
    abi: any
}

export interface DynamicContractConfig {
    name: string,
    abi: any
}

export interface SyncState {
    block: number
    logIndex: number
}

export class EVMLogsTransport extends Server implements CustomTransportStrategy {

    rpc: JsonRpcProvider
    status: SyncState
    ctx: any

    config: IndexerConfig
    logger = new Logger('EVMLogIndexer');

    limiter = new Bottleneck({
        maxConcurrent: 1
    });

    constructor(config: IndexerConfig, ctx: any) {
        super()
        this.config = config
        this.rpc = new JsonRpcProvider(this.config.evmRpc)
        this.ctx = ctx
    }
    
    /**
     * This method is triggered when you run "app.listen()".
     */
    async listen(callback: () => void) {

        this.logger.log("Loading current state...")

        const handler: MessageHandler | undefined = this.messageHandlers.get('getSyncState');
        this.status = await handler(undefined, this.ctx)

        this.logger.log(`Start sync from block ${this.status.block}...`)

        let loops = 2
        while (loops >= 2) {
            let currentBlock = await this.rpc.getBlockNumber()
            this.logger.log(`Current block number: ${currentBlock}`)
            loops = await this.syncToCurrentBlock(currentBlock)
        }
        
        this.rpc.on('block', (blockNumber) => this.limiter.schedule(() => this.onNewBlock(blockNumber)))
        callback();
    }

    /**
     * This method is triggered on application shutdown.
     */
    close() {
        this.rpc.removeAllListeners()
    }
    
    async onNewBlock(blockNumber: number): Promise<void> {
        this.logger.log(`Checking data of block #${blockNumber}`)
        var filter = {
            fromBlock: this.status.block + 1,
            toBlock: blockNumber
        };

        var logs = await this.rpc.getLogs(filter);
        for (const log of logs) {
            await this.parseLog(log)
        }
    }

    async syncToCurrentBlock(currentBlock: number): Promise<number> {
        const blockParsingEndedHandler: MessageHandler | undefined = this.messageHandlers.get("blockParsingEnded");
        let loop = 0
        
        try {
          for (let blockNumber = this.status.block; blockNumber < currentBlock; blockNumber+=this.config.blockBatchAmount) {
            loop += 1
            let toBlock = blockNumber + this.config.blockBatchAmount
            if(toBlock >= currentBlock)
                toBlock = currentBlock
            

            this.logger.log(`Parsing from block ${blockNumber} to ${toBlock}, current block: ${currentBlock}, remaining blocks: ${currentBlock-blockNumber})`)
              
            var filter = {
                fromBlock: blockNumber,
                toBlock
            };

            var logs = await this.rpc.getLogs(filter);
            let actualBlock: number = blockNumber
            

            for (const log of logs) {
                if(log.blockNumber > actualBlock) {
                    actualBlock = log.blockNumber
                    if(blockParsingEndedHandler !== undefined)
                        await blockParsingEndedHandler({block: actualBlock - 1}, this.ctx)
                }

                if(log.index <= this.status.logIndex && log.blockNumber == this.status.block)
                    continue

                await this.parseLog(log)
            }

            this.status.block = toBlock
            this.status.logIndex = 1_000_000
            await this.saveState()
          }
        } catch (error) {
            console.error(error)
        }

        if(blockParsingEndedHandler !== undefined)
            await blockParsingEndedHandler({block: currentBlock}, this.ctx)

        return loop
    }

    async parseLog(log: Log): Promise<void> {
        for (const contract of this.config.contracts) {
            if(log.address.toLowerCase() !== contract.address.toLowerCase())
                continue
            
            await this.handleLog(contract, log)
            this.status.block = log.blockNumber
            this.status.logIndex = log.index
            await this.saveState()
            return
        }

        for (const contract of this.config.dynamicContracts) {
            let getDynamicContractList = this.messageHandlers.get(`${contract.name}:List`);
            let addresses: string[] = await getDynamicContractList(undefined, this.ctx)

            for (const address of addresses) {
                if(log.address.toLowerCase() !== address.toLowerCase())
                    continue

                await this.handleLog(contract, log)
                this.status.block = log.blockNumber
                this.status.logIndex = log.index
                await this.saveState()
                return
            }
        }
    }

    async handleLog(contract: ContractConfig | DynamicContractConfig, log: Log) {
        let topics: string[] = log.topics.join(',').split(',')
        let iface = new Interface(contract.abi);
        let logParsed = iface.parseLog({ topics: topics, data: log.data })

        if(logParsed == null) {
            this.logger.warn(`Event with topic ${topics[0]} not found on ${contract.name}...`)
            return
        }

        try {
            this.logger.debug(`Call handler for: ${contract.name}:${logParsed.name}`)
            const logHandler: MessageHandler | undefined = this.messageHandlers.get(`${contract.name}:${logParsed.name}`);
            await logHandler({address: log.address, log: logParsed}, this.ctx)
        } catch (error) {
            this.logger.warn(`${contract.name}:${logParsed.name} handler not found...`)
        }
    }
    
    async saveState(): Promise<void> {
        const handler: MessageHandler | undefined = this.messageHandlers.get('setSyncState');
        await handler(this.status, this.ctx)
    }
}
