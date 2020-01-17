import {AccessoryHap, CharacteristicHap} from './hap';
import {
    AccessoryData, Home, Layout, LayoutSection, Automation, Pairing, Permissions, Scene,
} from './storage';
import {GetHomePermissionsResponseMessage} from './messages';
import {AccessoryStatus} from '../../common/types/accessories';
import {SystemInformationData} from '../../server/system-information';

export interface AddAccessoriesMessage {
    type: 'add-accessories';
    ids: string[];
}
export interface RemoveAccessoriesMessage {
    type: 'remove-accessories';
    ids: string[];
}
export interface UpdateAccessoryMessage {
    type: 'update-accessory';
    uuid: string;
    details: AccessoryHap;
}

export interface UpdateAccessoryStatusMessage {
    type: 'update-accessory-status';
    uuid: string;
    status: AccessoryStatus;
}

export interface UpdateCharacteristicMessage {
    type: 'update-characteristic';
    accessory_uuid: string;
    service_id: string;
    characteristic_id: string;
    details: CharacteristicHap;
}

export interface UpdateAccessoryDataMessage {
    type: 'update-accessory-data';
    uuid: string;
    data: AccessoryData;
}

export interface AddDiscoveredAccessoryMessage {
    type: 'add-discovered-accessory';
    plugin: string;
    accessory_discovery: number;
    id: number;
    data: any;
}
export interface RemoveDiscoveredAccessoryMessage {
    type: 'remove-discovered-accessory';
    plugin: string;
    accessory_discovery: number;
    id: number;
}

export interface UpdateHomeSettingsMessage {
    type: 'update-home-settings';
    data: Home;
}

export interface LayoutMessage {
    type: 'add-layout' | 'update-layout' | 'remove-layout';
    uuid: string;
}
export interface AddLayoutMessage extends LayoutMessage {
    type: 'add-layout';
}
export interface RemoveLayoutMessage extends LayoutMessage {
    type: 'remove-layout';
}
export interface UpdateLayoutMessage extends LayoutMessage {
    type: 'update-layout';
    data: Layout;
}

export interface LayoutSectionMessage {
    type: 'add-layout-section' | 'update-layout-section' | 'remove-layout-section';
    layout_uuid: string;
    uuid: string;
}
export interface AddLayoutSectionMessage extends LayoutSectionMessage {
    type: 'add-layout-section';
}
export interface RemoveLayoutSectionMessage extends LayoutSectionMessage {
    type: 'remove-layout-section';
}
export interface UpdateLayoutSectionMessage extends LayoutSectionMessage {
    type: 'update-layout-section';
    data: LayoutSection;
}

export interface AutomationMessage {
    type: 'add-automation' | 'update-automation' | 'remove-automation';
    uuid: string;
}
export interface AddAutomationMessage extends AutomationMessage {
    type: 'add-automation';
}
export interface RemoveAutomationMessage extends AutomationMessage {
    type: 'remove-automation';
}
export interface UpdateAutomationMessage extends AutomationMessage {
    type: 'update-automation';
    data: Automation;
}

export interface AutomationRunnerMessage {
    type: 'automation-running' | 'automation-progress' | 'automation-finished';
    runner_id: number;
}
export interface AutomationRunningMessage extends AutomationRunnerMessage {
    type: 'automation-running';
    automation_uuid: string;
}
export interface AutomationProgressMessage extends AutomationRunnerMessage {
    type: 'automation-progress';
    /** A number between 0 and 1. */
    progress: number;
}
export interface AutomationFinishedMessage extends AutomationRunnerMessage {
    type: 'automation-finished';
}

export interface SceneMessage {
    type: 'add-scene' | 'update-scene' | 'remove-scene' | 'scene-activating' | 'scene-activated' |
        'scene-deactivating' | 'scene-deactivated' | 'scene-progress'; // eslint-disable-line @typescript-eslint/indent
    uuid: string;
}
export interface AddSceneMessage extends SceneMessage {
    type: 'add-scene';
}
export interface RemoveSceneMessage extends SceneMessage {
    type: 'remove-scene';
}
export interface UpdateSceneMessage extends SceneMessage {
    type: 'update-scene';
    data: Scene;
}
export interface SceneActivatingMessage extends SceneMessage {
    type: 'scene-activating';
    context: any;
}
export interface SceneActivatedMessage extends SceneMessage {
    type: 'scene-activated';
    context: any;
}
export interface SceneDeactivatingMessage extends SceneMessage {
    type: 'scene-deactivating';
    context: any;
}
export interface SceneDeactivatedMessage extends SceneMessage {
    type: 'scene-deactivated';
    context: any;
}
export interface SceneProgressMessage extends SceneMessage {
    type: 'scene-progress';
    progress: number;
}

export interface UpdatePairingsMessage {
    type: 'update-pairings';
    bridge_uuid: string;
}

export interface UpdatePairingDataMessage {
    type: 'update-pairing-data';
    id: string;
    data: Pairing;
}

export interface UpdatePermissionsMessage {
    type: 'update-permissions';
    data: GetHomePermissionsResponseMessage;
}

export interface StdoutMessage {
    type: 'stdout';
    data: string;
}
export interface StderrMessage {
    type: 'stderr';
    data: string;
}

export interface UpdateSystemInformationMessage {
    type: 'update-system-information';
    data: Partial<SystemInformationData>;
}

export interface ConsoleOutputMessage {
    type: 'console-output';
    id: number;
    stream: 'out' | 'err';
    data: string;
}

export type SendableBroadcastMessage =
    AddAccessoriesMessage | RemoveAccessoriesMessage | UpdateAccessoryMessage | UpdateAccessoryStatusMessage |
    UpdateCharacteristicMessage |
    UpdateAccessoryDataMessage | AddDiscoveredAccessoryMessage | RemoveDiscoveredAccessoryMessage |
    UpdateHomeSettingsMessage |
    AddLayoutMessage | RemoveLayoutMessage | UpdateLayoutMessage |
    AddLayoutSectionMessage | RemoveLayoutSectionMessage | UpdateLayoutSectionMessage |
    AddAutomationMessage | RemoveAutomationMessage | UpdateAutomationMessage |
    AutomationRunningMessage | AutomationProgressMessage | AutomationFinishedMessage |
    AddSceneMessage | RemoveSceneMessage | UpdateSceneMessage |
    SceneActivatingMessage | SceneActivatedMessage | SceneDeactivatingMessage | SceneDeactivatedMessage |
    SceneProgressMessage |
    UpdatePairingsMessage | UpdatePairingDataMessage;
export type BroadcastMessage =
    SendableBroadcastMessage | UpdatePermissionsMessage | StdoutMessage | StderrMessage |
    UpdateSystemInformationMessage | ConsoleOutputMessage;
