import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
//asasas
@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();

    // Extract the question or message payload
    const question = data?.question?.toLowerCase?.() ?? '';

    // ✅ Define keywords that are allowed in the ERP domain
    const allowedKeywords = [
      'stock', 'inventory', 'provider', 'orders',
      'performance', 'delivery', 'quality', 'saab',
      'project', 'department', 'vacation', 'employee'
    ];

    const isInScope = allowedKeywords.some((kw) => question.includes(kw));

    if (!isInScope) {
      // ❌ Block out-of-scope questions
      throw new WsException(
        'Your request seems out of context. Please check your sources and try again.'
      );
    }

    return true;
  }
}