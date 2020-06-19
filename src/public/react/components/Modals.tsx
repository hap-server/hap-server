import * as React from 'react';
import Client from '../../../client/client';
import Modals, {Modal} from '../../modals';

import ReactiveComponent from '../reactive-component';

export interface ModalsProps {
    modals: Modals<typeof React.Component, React.Component>;
    client: Client;
    canAddAccessories: boolean;
    canCreateBridges: boolean;
    canOpenConsole: boolean;
    canManageUsers: boolean;
    canManagePermissions: boolean;
    canAccessServerSettings: boolean;
    bridgeUuids?: string[]; // || []
    setupToken: string;
}

export default class ModalsComponent extends ReactiveComponent<ModalsProps> {
    private modal_ids = new WeakMap<Modal<React.Component>, number>();
    private id = 0;

    getModalID(modal: Modal<React.Component>) {
        if (!this.modal_ids.has(modal)) {
            this.modal_ids.set(modal, this.id++);
        }

        return this.modal_ids.get(modal);
    }

    render() {
        return <div className="modals">
            {this.props.modals.getDisplayModals().map(modal =>
                <ModalComponent key={this.getModalID(modal)} modal={modal} />)}
        </div>;
    }

    pushModal(modal: Modal<React.Component>) {
        this.props.modals.add(modal);
    }
}

export interface ModalProps {
    modal: Modal<React.Component>;
}

export class ModalComponent extends ReactiveComponent<ModalProps> {
    constructor(props: ModalProps) {
        super(props);

        this.props.modal.instance = this;
    }

    render() {
        return null;
    }
}
