import { applyDecorators } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

export function HandleEVMLog(logPattern: string) {
	return applyDecorators(
		MessagePattern(logPattern),
	);
}

export function HandleSyncState(pattern: string) {
	return applyDecorators(
		MessagePattern(pattern),
	);
}
