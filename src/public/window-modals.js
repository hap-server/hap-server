import querystring from 'querystring';
import Modals from './modals';

const modal_windows = new WeakMap();

const external_types = [
    // 'authenticate',
    'settings',
    'add-accessory',
    'layout-settings',
    'new-layout',
    'delete-layout',
    'accessory-settings',
    'new-bridge',
    'delete-bridge',
    'pairing-settings',
    'service-settings',
    // 'accessory-details',
    'scene-settings',
    'new-scene',
    // 'setup',
];

export class WindowModals extends Modals {
    _add(modal) {
        if (modal_windows.has(modal)) {
            modal_windows.get(modal).focus();
            return;
        }

        if (!external_types.includes(modal.type)) return;

        const qs = Object.assign({
            type: modal.type,
        }, this.constructor.getQueryStringForModal(modal));

        const features = {
            menubar: false,
            toolbar: false,
            location: false,
            personalbar: false,
            directories: false,
            status: false,
            dialog: true,
        };

        const modal_window = window.open('modal.html?' + querystring.stringify(qs), '_blank', Object.entries(features)
            .map(([k, v]) => `${k}=${v === true ? 'yes' : v === false ? 'no' : v}`).join(','));

        const onclose = () => {
            modal_window.removeEventListener('close', onclose);
            let index;
            while ((index = this.stack.indexOf(modal)) > -1) {
                this.stack.splice(index, 1);
            }
        };
        modal_window.addEventListener('close', onclose);

        modal_windows.set(modal, modal_window);
    }

    _remove(modal) {
        if (!modal_windows.has(modal)) return;

        const modal_window = modal_windows.get(modal);
        modal_window.close();

        modal_windows.delete(modal);
    }

    static getQueryStringForModal(modal) {
        if (modal.type === 'layout-settings' || modal.type === 'delete-layout') {
            return {layout: modal.layout.uuid};
        }

        if (modal.type === 'accessory-settings' || modal.type === 'delete-bridge') {
            return {accessory: modal.accessory.uuid};
        }

        if (modal.type === 'pairing-settings') {
            return {accessory: modal.accessory.uuid, pairing: modal.pairing.id};
        }

        if (modal.type === 'service-settings') {
            return {accessory: modal.service.accessory.uuid, service: modal.service.uuid};
        }

        if (modal.type === 'scene-settings') {
            return {scene: modal.scene.uuid};
        }
    }

    getDisplayModals() {
        return this.stack.filter(m => !external_types.includes(m.type));
    }
}

export class ModalWindowModals extends Modals {
    get stack() {
        throw new Error('Cannot read modal stack from child windows');
    }

    set stack(stack) {}

    add(modal) {
        window.opener.postMessage({
            type: 'modal',
            modal: Object.assign({
                type: modal.type,
            }, WindowModals.getQueryStringForModal(modal)),
        }, location.origin);
    }

    remove() {
        throw new Error('Cannot close modals from child windows');
    }
}

const is_child_window = window.opener && window.opener.location.origin === location.origin;

export default is_child_window ? ModalWindowModals : WindowModals;
