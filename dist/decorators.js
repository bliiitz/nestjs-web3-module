"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandleSyncState = exports.HandleEVMLog = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
function HandleEVMLog(logPattern) {
    return (0, common_1.applyDecorators)((0, microservices_1.MessagePattern)(logPattern));
}
exports.HandleEVMLog = HandleEVMLog;
function HandleSyncState(pattern) {
    return (0, common_1.applyDecorators)((0, microservices_1.MessagePattern)(pattern));
}
exports.HandleSyncState = HandleSyncState;
//# sourceMappingURL=decorators.js.map