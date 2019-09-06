
export default class Modals {
    constructor() {
        this.stack = [];
    }

    add(data) {
        if (data instanceof Modal) {
            if (data.modals !== this) {
                throw new Error('Invalid modal');
            }

            this.stack.push(modal);
            modal.onopen();
            this._add(modal);
            return data;
        } else {
            const modal = new (Modal.types[data.type] || Modal)(this, data);
            this.stack.push(modal);
            modal.onopen();
            this._add(modal);
            return modal;
        }
    }

    _add(modal) {
        //
    }

    remove(modal) {
        let index;
        while ((index = this.stack.indexOf(modal)) > -1) {
            this.stack.splice(index, 1);
        }
        modal.onclose();
        this._remove(modal);
    }

    _remove(modal) {
        //
    }

    get modal_open() {
        return !!this.getDisplayModals().length;
    }

    getDisplayModals() {
        return this.stack;
    }
}

export class Modal {
    constructor(modals, data) {
        this.modals = modals;
        Object.assign(this, data);
    }

    static create(modals, type, data) {
        if (typeof type === 'string' && !data) data = {type};
        if (typeof type === 'object') data = type;
        if (!data) data = {};
        if (typeof type === 'string') data.type = type;
        return new (this.types[data.type] || this)(modals, data);
    }

    onopen() {}
    onclose() {}
}

Modal.types = {};

export class AuthenticateModal extends Modal {
    get title() {
        return 'Login';
    }
}

Modal.types.authenticate = AuthenticateModal;

export class SettingsModal extends Modal {
    get title() {
        return 'Settings';
    }
}

Modal.types.settings = SettingsModal;

export class AddAccessoryModal extends Modal {
    get title() {
        return 'Add accessory';
    }
}

Modal.types['add-accessory'] = AddAccessoryModal;

export class LayoutSettingsModal extends Modal {
    get title() {
        return this.layout.name + ' Settings';
    }
}

Modal.types['layout-settings'] = LayoutSettingsModal;

export class NewLayoutModal extends Modal {
    get title() {
        return 'New layout';
    }
}

Modal.types['new-layout'] = NewLayoutModal;

export class DeleteLayoutModal extends LayoutSettingsModal {
    get title() {
        return 'Delete ' + this.layout.name + '?';
    }
}

Modal.types['delete-layout'] = DeleteLayoutModal;

export class AccessorySettingsModal extends Modal {
    get title() {
        return this.accessory.name + ' Settings';
    }
}

Modal.types['accessory-settings'] = AccessorySettingsModal;

export class NewBridgeModal extends Modal {
    get title() {
        return 'New bridge';
    }
}

Modal.types['new-bridge'] = NewBridgeModal;

export class DeleteBridgeModal extends AccessorySettingsModal {
    get title() {
        return 'Delete ' + this.accessory.name + '?';
    }
}

Modal.types['delete-bridge'] = DeleteBridgeModal;

export class PairingSettingsModal extends Modal {
    get title() {
        return ((this.data && this.data.name) || this.pairing.id) + ' Settings';
    }
}

Modal.types['pairing-settings'] = PairingSettingsModal;

export class ServiceSettingsModal extends Modal {
    get title() {
        return (this.service.name || this.service.accessory.name) + ' Settings';
    }
}

Modal.types['service-settings'] = ServiceSettingsModal;

export class AccessoryDetailsModal extends Modal {
    get title() {
        return this.service.name || this.service.accessory.name;
    }
}

Modal.types['accessory-details'] = AccessoryDetailsModal;

export class SceneSettingsModal extends Modal {
    get title() {
        return (this.scene.data.name || this.scene.uuid) + ' Settings';
    }
}

Modal.types['scene-settings'] = SceneSettingsModal;

export class NewSceneModal extends Modal {
    get title() {
        return 'New scene';
    }
}

Modal.types['new-scene'] = NewSceneModal;

export class SetupModal extends Modal {
    get title() {
        return 'Setup';
    }
}

Modal.types.setup = SetupModal;
