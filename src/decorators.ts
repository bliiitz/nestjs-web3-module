import { applyDecorators } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { ethers } from 'ethers';

export function HandleEVMLog(logPattern: string) {
	return applyDecorators(
		MessagePattern(logPattern),
	);
}
