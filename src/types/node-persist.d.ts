import NodePersist from 'node-persist';

declare module 'node-persist' {
    export function create(options: NodePersist.InitOptions): typeof NodePersist;
}
