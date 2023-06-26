import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import Bottleneck from "bottleneck";
import { Logger } from '@nestjs/common';
import { providers } from 'ethers';
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
export interface EVMLog<T> {
    address: string;
    blockNumber: number;
    index: number;
    data: T;
}
export declare class EVMLogsTransport extends Server implements CustomTransportStrategy {
    rpc: providers.JsonRpcProvider;
    status: SyncState;
    ctx: any;
    config: IndexerConfig;
    logger: Logger;
    limiter: Bottleneck;
    constructor(config: IndexerConfig, ctx: any);
    listen(callback: () => void): Promise<void>;
    close(): void;
    onNewBlock(blockNumber: number): Promise<void>;
    syncToCurrentBlock(currentBlock: number): Promise<number>;
    parseLog(log: providers.Log): Promise<void>;
    handleLog(contract: ContractConfig | DynamicContractConfig, log: providers.Log): Promise<void>;
    saveState(): Promise<void>;
}
