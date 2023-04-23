import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { JsonRpcProvider, Log } from 'ethers';
export interface IndexerConfig {
    evmRpc: string;
    startAtBlock: number;
    blockBatchAmount: number;
    contracts: ContractConfig[];
    dynamicContracts: DynamicContractConfig[];
}
export interface ContractConfig {
    name: string;
    address: string;
    abi: any;
}
export interface DynamicContractConfig {
    name: string;
    abi: any;
}
export interface SyncState {
    block: number;
    logIndex: number;
}
export declare class EVMLogsTransport extends Server implements CustomTransportStrategy {
    rpc: JsonRpcProvider;
    status: SyncState;
    ctx: any;
    config: IndexerConfig;
    logger: Logger;
    constructor(config: IndexerConfig, ctx: any);
    listen(callback: () => void): Promise<void>;
    close(): void;
    onNewBlock(blockNumber: number): Promise<void>;
    syncToCurrentBlock(currentBlock: number): Promise<number>;
    parseLog(log: Log): Promise<void>;
    handleLog(contract: ContractConfig | DynamicContractConfig, log: Log): Promise<void>;
    saveState(): Promise<void>;
}
