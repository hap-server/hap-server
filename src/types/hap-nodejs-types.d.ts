import {PredefinedService} from 'hap-nodejs/lib/Service';
import {PredefinedCharacteristic} from 'hap-nodejs/lib/Characteristic';

declare module 'hap-nodejs/lib/Service' {
    namespace Service {
        const AccessoryInformation: PredefinedService;
        const AirPurifier: PredefinedService;
        const AirQualitySensor: PredefinedService;
        const BatteryService: PredefinedService;
        const CameraRTPStreamManagement: PredefinedService;
        const CarbonDioxideSensor: PredefinedService;
        const CarbonMonoxideSensor: PredefinedService;
        const ContactSensor: PredefinedService;
        const Door: PredefinedService;
        const Doorbell: PredefinedService;
        const Fan: PredefinedService;
        const Fanv2: PredefinedService;
        const FilterMaintenance: PredefinedService;
        const Faucet: PredefinedService;
        const GarageDoorOpener: PredefinedService;
        const HeaterCooler: PredefinedService;
        const HumidifierDehumidifier: PredefinedService;
        const HumiditySensor: PredefinedService;
        const IrrigationSystem: PredefinedService;
        const LeakSensor: PredefinedService;
        const LightSensor: PredefinedService;
        const Lightbulb: PredefinedService;
        const LockManagement: PredefinedService;
        const LockMechanism: PredefinedService;
        const Microphone: PredefinedService;
        const MotionSensor: PredefinedService;
        const OccupancySensor: PredefinedService;
        const Outlet: PredefinedService;
        const SecuritySystem: PredefinedService;
        const ServiceLabel: PredefinedService;
        const Slat: PredefinedService;
        const SmokeSensor: PredefinedService;
        const Speaker: PredefinedService;
        const StatelessProgrammableSwitch: PredefinedService;
        const Switch: PredefinedService;
        const TemperatureSensor: PredefinedService;
        const Thermostat: PredefinedService;
        const Valve: PredefinedService;
        const Window: PredefinedService;
        const WindowCovering: PredefinedService;

        // Bridge
        const CameraControl: PredefinedService;
        const StatefulProgrammableSwitch: PredefinedService;
        const Label: typeof ServiceLabel;
        const BridgeConfiguration: PredefinedService;
        const BridgingState: PredefinedService;
        const Pairing: PredefinedService;
        const ProtocolInformation: PredefinedService;
        const Relay: PredefinedService;
        const TimeInformation: PredefinedService;
        const TunneledBTLEAccessoryService: PredefinedService;

        // Television
        const Television: PredefinedService;
        const InputSource: PredefinedService;
        const TelevisionSpeaker: PredefinedService;
    }
}

declare module 'hap-nodejs/lib/Characteristic' {
    namespace Characteristic {
        const AccessoryFlags: PredefinedCharacteristic<number>;
        const Active: PredefinedCharacteristic<number, {
            INACTIVE: 0;
            ACTIVE: 1;
        }>;
        const AdministratorOnlyAccess: PredefinedCharacteristic<boolean>;
        const AirParticulateDensity: PredefinedCharacteristic<number>;
        const AirParticulateSize: PredefinedCharacteristic<number, {
            _2_5_M: 0;
            _10_M: 1;
        }>;
        const AirQuality: PredefinedCharacteristic<number, {
            UNKNOWN: 0;
            EXCELLENT: 1;
            GOOD: 2;
            FAIR: 3;
            INFERIOR: 4;
            POOR: 5;
        }>;
        const AudioFeedback: PredefinedCharacteristic<boolean>;
        const BatteryLevel: PredefinedCharacteristic<number>;
        const Brightness: PredefinedCharacteristic<number>;
        const CarbonDioxideDetected: PredefinedCharacteristic<number, {
            CO2_LEVELS_NORMAL: 0;
            CO2_LEVELS_ABNORMAL: 1;
        }>;
        const CarbonDioxideLevel: PredefinedCharacteristic<number>;
        const CarbonDioxidePeakLevel: PredefinedCharacteristic<number>;
        const CarbonMonoxideDetected: PredefinedCharacteristic<number, {
            CO_LEVELS_NORMAL: 0;
            CO_LEVELS_ABNORMAL: 1;
        }>;
        const CarbonMonoxideLevel: PredefinedCharacteristic<number>;
        const CarbonMonoxidePeakLevel: PredefinedCharacteristic<number>;
        const ChargingState: PredefinedCharacteristic<number, {
            NOT_CHARGING: 0;
            CHARGING: 1;
            NOT_CHARGEABLE: 2;
        }>;
        const ColorTemperature: PredefinedCharacteristic<number>;
        const ContactSensorState: PredefinedCharacteristic<number, {
            CONTACT_DETECTED: 0;
            CONTACT_NOT_DETECTED: 1;
        }>;
        const CoolingThresholdTemperature: PredefinedCharacteristic<number>;
        const CurrentAirPurifierState: PredefinedCharacteristic<number, {
            INACTIVE: 0;
            IDLE: 1;
            PURIFYING_AIR: 2;
        }>;
        const CurrentAmbientLightLevel: PredefinedCharacteristic<number>;
        const CurrentDoorState: PredefinedCharacteristic<number, {
            OPEN: 0;
            CLOSED: 1;
            OPENING: 2;
            CLOSING: 3;
            STOPPED: 4;
        }>;
        const CurrentFanState: PredefinedCharacteristic<number, {
            INACTIVE: 0;
            IDLE: 1;
            BLOWING_AIR: 2;
        }>;
        const CurrentHeaterCoolerState: PredefinedCharacteristic<number, {
            INACTIVE: 0;
            IDLE: 1;
            HEATING: 2;
            COOLING: 3;
        }>;
        const CurrentHeatingCoolingState: PredefinedCharacteristic<number, {
            OFF: 0;
            HEAT: 1;
            COOL: 2;
        }>;
        const CurrentHorizontalTiltAngle: PredefinedCharacteristic<number>;
        const CurrentHumidifierDehumidifierState: PredefinedCharacteristic<number, {
            INACTIVE: 0;
            IDLE: 1;
            HUMIDIFYING: 2;
            DEHUMIDIFYING: 3;
        }>;
        const CurrentPosition: PredefinedCharacteristic<number>;
        const CurrentRelativeHumidity: PredefinedCharacteristic<number>;
        const CurrentSlatState: PredefinedCharacteristic<number, {
            FIXED: 0;
            JAMMED: 1;
            SWINGING: 2;
        }>;
        const CurrentTemperature: PredefinedCharacteristic<number>;
        const CurrentTiltAngle: PredefinedCharacteristic<number>;
        const CurrentVerticalTiltAngle: PredefinedCharacteristic<number>;
        const DigitalZoom: PredefinedCharacteristic<number>;
        const FilterChangeIndication: PredefinedCharacteristic<number, {
            FILTER_OK: 0;
            CHANGE_FILTER: 1;
        }>;
        const FilterLifeLevel: PredefinedCharacteristic<number>;
        const FirmwareRevision: PredefinedCharacteristic<string>;
        const HardwareRevision: PredefinedCharacteristic<string>;
        const HeatingThresholdTemperature: PredefinedCharacteristic<number>;
        const HoldPosition: PredefinedCharacteristic<boolean>;
        const Hue: PredefinedCharacteristic<number>;
        const Identify: PredefinedCharacteristic<boolean>;
        const ImageMirroring: PredefinedCharacteristic<boolean>;
        const ImageRotation: PredefinedCharacteristic<number>;
        const InUse: PredefinedCharacteristic<number, {
            NOT_IN_USE: 0;
            IN_USE: 1;
        }>;
        const IsConfigured: PredefinedCharacteristic<number, {
            NOT_CONFIGURED: 0;
            CONFIGURED: 1;
        }>;
        const LeakDetected: PredefinedCharacteristic<number, {
            LEAK_NOT_DETECTED: 0;
            LEAK_DETECTED: 1;
        }>;
        const LockControlPoint: PredefinedCharacteristic<string>;
        const LockCurrentState: PredefinedCharacteristic<number, {
            UNSECURED: 0;
            SECURED: 1;
            JAMMED: 2;
            UNKNOWN: 3;
        }>;
        const LockLastKnownAction: PredefinedCharacteristic<number, {
            SECURED_PHYSICALLY_INTERIOR: 0;
            UNSECURED_PHYSICALLY_INTERIOR: 1;
            SECURED_PHYSICALLY_EXTERIOR: 2;
            UNSECURED_PHYSICALLY_EXTERIOR: 3;
            SECURED_BY_KEYPAD: 4;
            UNSECURED_BY_KEYPAD: 5;
            SECURED_REMOTELY: 6;
            UNSECURED_REMOTELY: 7;
            SECURED_BY_AUTO_SECURE_TIMEOUT: 8;
        }>;
        const LockManagementAutoSecurityTimeout: PredefinedCharacteristic<number>;
        const LockPhysicalControls: PredefinedCharacteristic<number, {
            CONTROL_LOCK_DISABLED: 0;
            CONTROL_LOCK_ENABLED: 1;
        }>;
        const LockTargetState: PredefinedCharacteristic<number, {
            UNSECURED: 0;
            SECURED: 1;
        }>;
        const Logs: PredefinedCharacteristic<string>;
        const Manufacturer: PredefinedCharacteristic<string>;
        const Model: PredefinedCharacteristic<string>;
        const MotionDetected: PredefinedCharacteristic<boolean>;
        const Mute: PredefinedCharacteristic<boolean>;
        const Name: PredefinedCharacteristic<string>;
        const NightVision: PredefinedCharacteristic<boolean>;
        const NitrogenDioxideDensity: PredefinedCharacteristic<number>;
        const ObstructionDetected: PredefinedCharacteristic<boolean>;
        const OccupancyDetected: PredefinedCharacteristic<number, {
            OCCUPANCY_NOT_DETECTED: 0;
            OCCUPANCY_DETECTED: 1;
        }>;
        const On: PredefinedCharacteristic<boolean>;
        const OpticalZoom: PredefinedCharacteristic<number>;
        const OutletInUse: PredefinedCharacteristic<boolean>;
        const OzoneDensity: PredefinedCharacteristic<number>;
        const PairSetup: PredefinedCharacteristic<string>;
        const PairVerify: PredefinedCharacteristic<string>;
        const PairingFeatures: PredefinedCharacteristic<number>;
        const PairingPairings: PredefinedCharacteristic<string>;
        const PM10Density: PredefinedCharacteristic<number>;
        const PM2_5Density: PredefinedCharacteristic<number>;
        const PositionState: PredefinedCharacteristic<number, {
            DECREASING: 0;
            INCREASING: 1;
            STOPPED: 2;
        }>;
        const ProgramMode: PredefinedCharacteristic<number, {
            NO_PROGRAM_SCHEDULED: 0;
            PROGRAM_SCHEDULED: 1;
            PROGRAM_SCHEDULED_MANUAL_MODE_: 2;
        }>;
        const ProgrammableSwitchEvent: PredefinedCharacteristic<number, {
            SINGLE_PRESS: 0;
            DOUBLE_PRESS: 1;
            LONG_PRESS: 2;
        }>;
        const RelativeHumidityDehumidifierThreshold: PredefinedCharacteristic<number>;
        const RelativeHumidityHumidifierThreshold: PredefinedCharacteristic<number>;
        const RemainingDuration: PredefinedCharacteristic<number>;
        const ResetFilterIndication: PredefinedCharacteristic<number>;
        const RotationDirection: PredefinedCharacteristic<number, {
            CLOCKWISE: 0;
            COUNTER_CLOCKWISE: 1;
        }>;
        const RotationSpeed: PredefinedCharacteristic<number>;
        const Saturation: PredefinedCharacteristic<number>;
        const SecuritySystemAlarmType: PredefinedCharacteristic<number>;
        const SecuritySystemCurrentState: PredefinedCharacteristic<number, {
            STAY_ARM: 0;
            AWAY_ARM: 1;
            NIGHT_ARM: 2;
            DISARMED: 3;
            ALARM_TRIGGERED: 4;
        }>;
        const SecuritySystemTargetState: PredefinedCharacteristic<number, {
            STAY_ARM: 0;
            AWAY_ARM: 1;
            NIGHT_ARM: 2;
            DISARM: 3;
        }>;
        const SelectedRTPStreamConfiguration: PredefinedCharacteristic<string>;
        const SerialNumber: PredefinedCharacteristic<string>;
        const ServiceLabelIndex: PredefinedCharacteristic<number>;
        const ServiceLabelNamespace: PredefinedCharacteristic<number, {
            DOTS: 0;
            ARABIC_NUMERALS: 1;
        }>;
        const SetDuration: PredefinedCharacteristic<number>;
        const SetupEndpoints: PredefinedCharacteristic<string>;
        const SlatType: PredefinedCharacteristic<number, {
            HORIZONTAL: 0;
            VERTICAL: 1;
        }>;
        const SmokeDetected: PredefinedCharacteristic<number, {
            SMOKE_NOT_DETECTED: 0;
            SMOKE_DETECTED: 1;
        }>;
        const StatusActive: PredefinedCharacteristic<boolean>;
        const StatusFault: PredefinedCharacteristic<number, {
            NO_FAULT: 0;
            GENERAL_FAULT: 1;
        }>;
        const StatusJammed: PredefinedCharacteristic<number, {
            NOT_JAMMED: 0;
            JAMMED: 1;
        }>;
        const StatusLowBattery: PredefinedCharacteristic<number, {
            BATTERY_LEVEL_NORMAL: 0;
            BATTERY_LEVEL_LOW: 1;
        }>;
        const StatusTampered: PredefinedCharacteristic<number, {
            NOT_TAMPERED: 0;
            TAMPERED: 1;
        }>;
        const StreamingStatus: PredefinedCharacteristic<string>;
        const SulphurDioxideDensity: PredefinedCharacteristic<number>;
        const SupportedAudioStreamConfiguration: PredefinedCharacteristic<string>;
        const SupportedRTPConfiguration: PredefinedCharacteristic<string>;
        const SupportedVideoStreamConfiguration: PredefinedCharacteristic<string>;
        const SwingMode: PredefinedCharacteristic<number, {
            SWING_DISABLED: 0;
            SWING_ENABLED: 1;
        }>;
        const TargetAirPurifierState: PredefinedCharacteristic<number, {
            MANUAL: 0;
            AUTO: 1;
        }>;
        const TargetAirQuality: PredefinedCharacteristic<number, {
            EXCELLENT: 0;
            GOOD: 1;
            FAIR: 2;
        }>;
        const TargetDoorState: PredefinedCharacteristic<number, {
            OPEN: 0;
            CLOSED: 1;
        }>;
        const TargetFanState: PredefinedCharacteristic<number, {
            MANUAL: 0;
            AUTO: 1;
        }>;
        const TargetHeaterCoolerState: PredefinedCharacteristic<number, {
            AUTO: 0;
            HEAT: 1;
            COOL: 2;
        }>;
        const TargetHeatingCoolingState: PredefinedCharacteristic<number, {
            OFF: 0;
            HEAT: 1;
            COOL: 3;
            AUTO: 3;
        }>;
        const TargetHorizontalTiltAngle: PredefinedCharacteristic<number>;
        const TargetHumidifierDehumidifierState: PredefinedCharacteristic<number, {
            /** @deprecated */
            AUTO: 0;
            HUMIDIFIER_OR_DEHUMIDIFIER: 0;
            HUMIDIFIER: 1;
            DEHUMIDIFIER: 3;
        }>;
        const TargetPosition: PredefinedCharacteristic<number>;
        const TargetRelativeHumidity: PredefinedCharacteristic<number>;
        const TargetSlatState: PredefinedCharacteristic<number, {
            MANUAL: 0;
            AUTO: 1;
        }>;
        const TargetTemperature: PredefinedCharacteristic<number>;
        const TargetTiltAngle: PredefinedCharacteristic<number>;
        const TargetVerticalTiltAngle: PredefinedCharacteristic<number>;
        const TemperatureDisplayUnits: PredefinedCharacteristic<number, {
            CELSIUS: 0;
            FAHRENHEIT: 1;
        }>;
        const ValveType: PredefinedCharacteristic<number, {
            GENERIC_VALUE: 0;
            IRRIGATION: 1;
            SHOWER_HEAD: 2;
            WATER_FAUCET: 3;
        }>;
        const Version: PredefinedCharacteristic<string>;
        const VOCDensity: PredefinedCharacteristic<number>;
        const Volume: PredefinedCharacteristic<number>;
        const WaterLevel: PredefinedCharacteristic<number>;

        // Bridge
        const AppMatchingIdentifier: PredefinedCharacteristic<string>;
        const ProgrammableSwitchOutputState: PredefinedCharacteristic<number>;
        const SoftwareRevision: PredefinedCharacteristic<string>;
        const SelectedStreamConfiguration: PredefinedCharacteristic<string>;
        const LabelNamespace: typeof ServiceLabelNamespace;
        const LabelIndex: typeof ServiceLabelIndex;
        const AccessoryIdentifier: PredefinedCharacteristic<string>;
        const Category: PredefinedCharacteristic<number>;
        const ConfigureBridgedAccessory: PredefinedCharacteristic<string>;
        const ConfigureBridgedAccessoryStatus: PredefinedCharacteristic<string>;
        const CurrentTime: PredefinedCharacteristic<string>;
        const DayoftheWeek: PredefinedCharacteristic<number>;
        const DiscoverBridgedAccessories: PredefinedCharacteristic<number, {
            START_DISCOVERY: 0;
            STOP_DISCOVERY: 1;
        }>;
        const DiscoveredBridgedAccessories: PredefinedCharacteristic<number>;
        const LinkQuality: PredefinedCharacteristic<number>;
        const Reachable: PredefinedCharacteristic<boolean>;
        const RelayControlPoint: PredefinedCharacteristic<string>;
        const RelayEnabled: PredefinedCharacteristic<boolean>;
        const RelayState: PredefinedCharacteristic<number>;
        const TimeUpdate: PredefinedCharacteristic<boolean>;
        const TunnelConnectionTimeout: PredefinedCharacteristic<number>;
        const TunneledAccessoryAdvertising: PredefinedCharacteristic<boolean>;
        const TunneledAccessoryConnected: PredefinedCharacteristic<boolean>;
        const TunneledAccessoryStateNumber: PredefinedCharacteristic<number>;

        // Television
        const ActiveIdentifier: PredefinedCharacteristic<number>;
        const ConfiguredName: PredefinedCharacteristic<string>;
        const SleepDiscoveryMode: PredefinedCharacteristic<number, {
            NOT_DISCOVERABLE: 0;
            ALWAYS_DISCOVERABLE: 1;
        }>;
        const ClosedCaptions: PredefinedCharacteristic<number, {
            DISABLED: 0;
            ENABLED: 1;
        }>;
        const DisplayOrder: PredefinedCharacteristic<string>;
        const CurrentMediaState: PredefinedCharacteristic<number>;
        const TargetMediaState: PredefinedCharacteristic<number, {
            PLAY: 0;
            PAUSE: 1;
            STOP: 2;
        }>;
        const PictureMode: PredefinedCharacteristic<number, {
            OTHER: 0;
            STANDARD: 1;
            CALIBRATED: 2;
            CALIBRATED_DARK: 3;
            VIVID: 4;
            GAME: 5;
            COMPUTER: 6;
            CUSTOM: 7;
        }>;
        const PowerModeSelection: PredefinedCharacteristic<number, {
            SHOW: 0;
            HIDE: 1;
        }>;
        const RemoteKey: PredefinedCharacteristic<number, {
            REWIND: 0;
            FAST_FORWARD: 1;
            NEXT_TRACK: 2;
            PREVIOUS_TRACK: 3;
            ARROW_UP: 4;
            ARROW_DOWN: 5;
            ARROW_LEFT: 6;
            ARROW_RIGHT: 7;
            SELECT: 8;
            BACK: 9;
            EXIT: 10;
            PLAY_PAUSE: 11;
            INFORMATION: 15;
        }>;
        const InputSourceType: PredefinedCharacteristic<number, {
            OTHER: 0;
            HOME_SCREEN: 1;
            TUNER: 2;
            HDMI: 3;
            COMPOSITE_VIDEO: 4;
            S_VIDEO: 5;
            COMPONENT_VIDEO: 6;
            DVI: 7;
            AIRPLAY: 8;
            USB: 9;
            APPLICATION: 10;
        }>;
        const InputDeviceType: PredefinedCharacteristic<number, {
            OTHER: 0;
            TV: 1;
            RECORDING: 2;
            TUNER: 3;
            PLAYBACK: 4;
            AUDIO_SYSTEM: 5;
        }>;
        const Identifier: PredefinedCharacteristic<number>;
        const CurrentVisibilityState: PredefinedCharacteristic<number, {
            SHOWN: 0;
            HIDDEN: 1;
        }>;
        const TargetVisibilityState: PredefinedCharacteristic<number, {
            SHOWN: 0;
            HIDDEN: 1;
        }>;
        const VolumeControlType: PredefinedCharacteristic<number, {
            NONE: 0;
            RELATIVE: 1;
            RELATIVE_WITH_CURRENT: 2;
            ABSOLUTE: 3;
        }>;
        const VolumeSelector: PredefinedCharacteristic<number, {
            INCREMENT: 0;
            DECREMENT: 1;
        }>;
    }
}
