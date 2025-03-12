interface Action {

}

export interface ObjectActionDefinition<S, P> {
    name?: string;
    precondition?: (data: S) => boolean;
    script: (data: S, params: P) => any;
}

export function objectAction<S, P>(def: ObjectActionDefinition<S, P>): Action {
    return {} as Action;
}