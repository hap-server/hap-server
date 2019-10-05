
import VueI18n from 'vue-i18n';

export default class Modals {
    protected stack: Modal[] = [];
    component?;

    i18n: VueI18n;

    add(data) {
        if (data instanceof Modal) {
            if (data.modals !== this) {
                throw new Error('Invalid modal');
            }

            this.stack.push(data);
            data.onopen();
            this._add(data);
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
    static readonly types: {[key: string]: typeof Modal} = {};

    [key: string]: any;

    constructor(readonly modals: Modals, data) {
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

export class AuthenticateModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.login');
    }
}

Modal.types.authenticate = AuthenticateModal;

export class SettingsModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.settings');
    }
}

Modal.types.settings = SettingsModal;

export class AddAccessoryModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.add_accessory');
    }
}

Modal.types['add-accessory'] = AddAccessoryModal;

export class LayoutSettingsModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.layout_settings', {name: this.layout.name});
    }
}

Modal.types['layout-settings'] = LayoutSettingsModal;

export class NewLayoutModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.new_layout');
    }
}

Modal.types['new-layout'] = NewLayoutModal;

export class DeleteLayoutModal extends LayoutSettingsModal {
    get title() {
        return this.modals.i18n.t('modals.delete_layout', {name: this.layout.name});
    }
}

Modal.types['delete-layout'] = DeleteLayoutModal;

export class AccessorySettingsModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.accessory_settings', {name: this.accessory.name});
    }
}

Modal.types['accessory-settings'] = AccessorySettingsModal;

export class NewBridgeModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.new_bridge');
    }
}

Modal.types['new-bridge'] = NewBridgeModal;

export class DeleteBridgeModal extends AccessorySettingsModal {
    get title() {
        return this.modals.i18n.t('modals.delete_bridge', {name: this.accessory.name});
    }
}

Modal.types['delete-bridge'] = DeleteBridgeModal;

export class PairingSettingsModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.pairing_settings', {
            name: (this.data && this.data.name) || this.pairing.id,
        });
    }
}

Modal.types['pairing-settings'] = PairingSettingsModal;

export class ServiceSettingsModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.service_settings', {
            name: this.service.name || this.service.accessory.name,
        });
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
        return this.modals.i18n.t('modals.scene_settings', {
            name: this.scene.data.name || this.scene.uuid,
        });
    }
}

Modal.types['scene-settings'] = SceneSettingsModal;

export class NewSceneModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.new_scene');
    }
}

Modal.types['new-scene'] = NewSceneModal;

export class SetupModal extends Modal {
    get title() {
        return this.modals.i18n.t('modals.setup');
    }
}

Modal.types.setup = SetupModal;
