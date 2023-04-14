import { applyDecorators } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

export function HandleEVMLog(logPattern: string) {
	return applyDecorators(
		MessagePattern(logPattern),
	);
}
