export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.toLowerCase().includes('disconnecting idle stream') ||
      (errorMessage.toLowerCase().includes('cancelled') && errorMessage.toLowerCase().includes('stream'))) {
    console.warn('Recoverable stream cancellation:', errorMessage);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    operationType,
    path,
  };

  console.error('API Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
