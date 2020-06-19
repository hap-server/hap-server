
import Vue, {Component} from 'vue';
import VueI18n from 'vue-i18n';

export default class Modals<C = Component, I = Vue> {
    protected stack: Modal<I>[] = [];
    component?: C = undefined;

    i18n?: VueI18n = undefined;

    add(data: Modal<I> | (object & {type: string})) {
        if (data instanceof Modal) {
            if (data.modals !== this) {
                throw new Error('Invalid modal');
            }

            this._add(data);
            return data;
        } else {
            const modal = new (Modal.types[data.type] || Modal)(this, data);
            this._add(modal);
            return modal;
        }
    }

    _add(modal: Modal<I>) {
        this.stack.push(modal);
        modal.onopen();
    }

    remove(modal: Modal<I>) {
        let index;
        while ((index = this.stack.indexOf(modal)) > -1) {
            this.stack.splice(index, 1);
        }
        modal.onclose();
        this._remove(modal);
    }

    _remove(modal: Modal<I>) {
        //
    }

    get modal_open() {
        return !!this.getDisplayModals().length;
    }

    getDisplayModals(): Modal<I>[] {
        return this.stack;
    }
}

export class Modal<I = Vue> {
    static readonly types: {[key: string]: typeof Modal} = {};

    instance: I | null = null;
    [key: string]: any;

    constructor(readonly modals: Modals<any, I>, data: object) {
        Object.assign(this, data);
    }

    static create(modals: Modals, type: keyof typeof Modal.types, data: object & {type?: string}) {
        if (typeof type === 'string' && !data) data = {type};
        if (typeof type === 'object') data = type;
        if (!data) data = {};
        if (typeof type === 'string') data.type = type;
        return new (this.types[data.type!] || this)(modals, data);
    }

    onopen() {}
    onclose() {}
}

export class AuthenticateModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.login');
    }
}

Modal.types.authenticate = AuthenticateModal;

export class SettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.settings');
    }
}

Modal.types.settings = SettingsModal;

export class AddAccessoryModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.add_accessory');
    }
}

Modal.types['add-accessory'] = AddAccessoryModal;

export class LayoutSettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.layout_settings', {name: this.layout.name});
    }
}

Modal.types['layout-settings'] = LayoutSettingsModal;

export class NewLayoutModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.new_layout');
    }
}

Modal.types['new-layout'] = NewLayoutModal;

export class DeleteLayoutModal<I = Vue> extends LayoutSettingsModal<I> {
    get title() {
        return this.modals.i18n!.t('modals.delete_layout', {name: this.layout.name});
    }
}

Modal.types['delete-layout'] = DeleteLayoutModal;

export class AccessorySettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.accessory_settings', {name: this.accessory.name});
    }
}

Modal.types['accessory-settings'] = AccessorySettingsModal;

export class AccessoryPlatformSettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.accessory_platform_settings', {uuid: this.uuid});
    }
}

Modal.types['accessory-platform-settings'] = AccessoryPlatformSettingsModal;

export class NewBridgeModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.new_bridge');
    }
}

Modal.types['new-bridge'] = NewBridgeModal;

export class DeleteBridgeModal<I = Vue> extends AccessorySettingsModal<I> {
    get title() {
        return this.modals.i18n!.t('modals.delete_bridge', {name: this.accessory.name});
    }
}

Modal.types['delete-bridge'] = DeleteBridgeModal;

export class PairingSettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.pairing_settings', {
            name: (this.data && this.data.name) || this.pairing.id,
        });
    }
}

Modal.types['pairing-settings'] = PairingSettingsModal;

export class ServiceSettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.service_settings', {
            name: this.service.name || this.service.accessory.name,
        });
    }
}

Modal.types['service-settings'] = ServiceSettingsModal;

export class AccessoryDetailsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.service.name || this.service.accessory.name;
    }
}

Modal.types['accessory-details'] = AccessoryDetailsModal;

export class SceneSettingsModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.scene_settings', {
            name: this.scene.data.name || this.scene.uuid,
        });
    }
}

Modal.types['scene-settings'] = SceneSettingsModal;

export class NewSceneModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.new_scene');
    }
}

Modal.types['new-scene'] = NewSceneModal;

export class SetupModal<I = Vue> extends Modal<I> {
    get title() {
        return this.modals.i18n!.t('modals.setup');
    }
}

Modal.types.setup = SetupModal;
