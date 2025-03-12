interface Action {

}

interface RecordActionDefinition<S, P> {
    name?: string;
    precondition?: (data: S) => boolean;
    script: (data: S, params: P) => any;
}

export function recordAction<S, P>(def: RecordActionDefinition<S, P>): Action {
    return {} as Action;
}