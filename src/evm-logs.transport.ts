import { CustomTransportStrategy, MessageHandler, Server } from '@nestjs/microservices';

import { Logger } from '@nestjs/common';
import ethers from 'ethers';
import { JsonRpcProvider } from 'ethers';

export interface IndexerConfig {
    evmRpc: string
    startAtBlock: number
    blockBatchAmount: number
    contracts: ContractConfig[]
}

export interface ContractConfig {
    name: string,
    address: string,
    abi: any
}

export interface SyncState {
    block: number
}

export class EVMLogsTransport extends Server implements CustomTransportStrategy {

    rpc: ethers.JsonRpcProvider
    status: SyncState

    config: IndexerConfig
    logger = new Logger('EVMLogTransport');

    constructor(config: IndexerConfig) {
        super()
        this.config = config
        this.rpc = new JsonRpcProvider(this.config.evmRpc)
    }

    async onMessage(messageChannel: string, ...args: any[]): Promise<any> {
		const handler: MessageHandler | undefined = this.messageHandlers.get(messageChannel);
		if (handler) {
			this.logger.debug(`Process message ${messageChannel}`);
			const [ipcMainEventObject, payload] = args;
			return await handler(payload, {
				evt: ipcMainEventObject,
			});
		}

		this.logger.warn(`No handlers for message ${messageChannel}`);
	}
    
    /**
     * This method is triggered when you run "app.listen()".
     */
    async listen(callback: () => void) {

        this.logger.log("Loading current state...")

        const handler: MessageHandler | undefined = this.messageHandlers.get('getSyncState');
        this.status = await handler(undefined)

        this.logger.log(`Start sync from block ${this.status.block}...`)

        let loops = 2
        while (loops < 2) {
            let currentBlock = await this.rpc.getBlockNumber()
            this.logger.log(`Current block number: ${currentBlock}`)
            loops = await this.syncToCurrentBlock(currentBlock)
        }
        
        this.rpc.on('block', (blockNumber) => this.onNewBlock(blockNumber))
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
            await this.parseLogs(log)
        }
    }

    async syncToCurrentBlock(currentBlock: number): Promise<number> {
        let loop = 0
        try {
          this.logger.log("Synced block : ", this.status.block)
          this.logger.log("Current block: ", currentBlock)
    
          for (let blockNumber = this.status.block + 1; blockNumber < currentBlock; blockNumber+=this.config.blockBatchAmount) {
            loop += 1
            let toBlock = blockNumber + this.config.blockBatchAmount
            this.logger.log(`Parsing from block ${blockNumber} to ${toBlock}, current block: ${currentBlock}, remaining blocks: ${currentBlock-blockNumber})`)
              
            if(toBlock >= currentBlock){
                toBlock = currentBlock
                blockNumber = currentBlock
            }

            var filter = {
                fromBlock: blockNumber,
                toBlock
            };

            var logs = await this.rpc.getLogs(filter);
            for (const log of logs) {
                await this.parseLogs(log)
            }
            
            this.status.block = toBlock
            await this.saveState()
          }
        } catch (error) {
            console.error(error)
        }

        return loop
    }

    async parseLogs(log: ethers.Log) {
        for (const contract of this.config.contracts) {
            if(log.address.toLowerCase() !== contract.address.toLowerCase())
                continue

            let topics: string[] = log.topics.join(',').split(',')
            let iface = new ethers.Interface(contract.abi);
            let logParsed = iface.parseLog({ topics: topics, data: log.data})

            const logHandler: MessageHandler | undefined = this.messageHandlers.get(`${contract.name}:${logParsed.name}`);
            await logHandler(logParsed)
        }
    }
    
    async saveState(): Promise<void> {
        const handler: MessageHandler | undefined = this.messageHandlers.get('setSyncState');
        await handler(this.status)
    }
}
