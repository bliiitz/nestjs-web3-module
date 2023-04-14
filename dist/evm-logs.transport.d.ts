import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import ethers from 'ethers';
export interface IndexerConfig {
    evmRpc: string;
    startAtBlock: number;
    blockBatchAmount: number;
    contracts: ContractConfig[];
}
export interface ContractConfig {
    name: string;
    address: string;
    abi: any;
}
export interface SyncState {
    block: number;
}
export declare class EVMLogsTransport extends Server implements CustomTransportStrategy {
    rpc: ethers.JsonRpcProvider;
    status: SyncState;
    config: IndexerConfig;
    logger: Logger;
    constructor(config: IndexerConfig);
    onMessage(messageChannel: string, ...args: any[]): Promise<any>;
    listen(callback: () => void): Promise<void>;
    close(): void;
    onNewBlock(blockNumber: number): Promise<void>;
    syncToCurrentBlock(currentBlock: number): Promise<number>;
    parseLogs(log: ethers.Log): Promise<void>;
    saveState(): Promise<void>;
}
