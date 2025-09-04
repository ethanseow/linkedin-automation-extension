export enum AutomationErrorType {
    CONNECTION_LIMIT_REACHED = 'CONNECTION_LIMIT_REACHED',
    REACHED_WEEKLY_LIMIT = 'REACHED_WEEKLY_LIMIT',
    QUERY_SELECTOR_TIMEOUT = 'QUERY_SELECTOR_TIMEOUT',
    DID_NOT_CONNECT_TO_PERSON = 'DID_NOT_CONNECT_TO_PERSON',
    DID_NOT_LOAD_MORE_CONNECTIONS = 'DID_NOT_LOAD_MORE_CONNECTIONS',
    NO_SEARCH_RESULTS_FOUND = 'NO_SEARCH_RESULTS_FOUND',
}


export class AutomationError extends Error {
    type: AutomationErrorType;
    constructor(message: string, type: AutomationErrorType) {
        super(message);
        this.name = 'AutomationError';
        this.type = type;
    }
}