Events
---

hap-server includes a custom EventEmitter which extends Node.js' EventEmitter to add browser-like event bubbling,
the ability to pass an event constructor instead of a type and partial
[ExtendableEvent](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent) support.

### `Events`

hap-server's custom EventEmitter is exposed as `Events` and can be used exactly the same as Node.js' EventEmitter.

```js
import {Events as EventEmitter} from '@hap-server/hap-server';

const events = new Events();

class AnObjectThatEmitsEvents extends EventEmitter {
    constructor() {
        super();

        // You can set the `parent` property to an event emitter to automatically emit events emitted on this object
        // on the parent emitter
        // this.parent = global_events;

        // ...
    }
}
```

#### `Events.prototype.emit`

To use the additional features in hap-server's EventEmitter you need to create a class for each type of event you
emit. This is optional and hap-server EventEmitters will behave exactly like Node.js' EventEmitter if you pass a
string to the emit method.

```js
// custom-event.js
import {Event} from '@hap-server/hap-server';

export default class CustomEvent extends Event {
    constructor(arg1, arg2, arg3) {
        super(...arguments);

        this.arg1 = arg1;
        this.arg2 = arg2;
        this.arg3 = arg3;
    }
}

// This is optional - if we don't add a type a new Symbol will be used (this means you can't listen for events the
// usual way passing the type to EventEmitter.prototype.on instead of a constructor)
// CustomEvent.type = 'custom-event';
```

```js
import {Events} from '@hap-server/hap-server';
import CustomEvent from './custom-event';

const events = new Events();

// ...

events.emit(CustomEvent, 'arg1', 'arg2', 'arg3');
```

If you need the event object when emitting the event or want to pass different data to the event constructor and
Node.js-style listeners you can also pass an instance of the event to the emit method.

```js
const event = new CustomEvent('arg1', 'arg2', 'arg3');

events.emit(event, 'arg1', 'arg2', 'arg3');
```

#### `Events.prototype.on`, `Events.prototype.once`, `Events.prototype.removeListener`

To listen for events that have a class pass the constructor to the on/once/removeListener methods. This tells the
event emitter to pass the handler the event object instead of arguments. This is optional and hap-server EventEmitters
will behave exactly like Node.js' EventEmitter if you pass a string to the on/once/removeListener methods.

```js
events.on(CustomEvent, event => {
    log.debug('Event', event);
});
```

You can also call the once method without a callback to return a Promise.

```js
const event = await events.once(CustomEvent);
```

If you pass an event type instead of the constructor the event emitter will pass the handler the event data instead
of the event object.

```js
// Assuming we did set CustomEvent.type = 'custom-event'
events.on('custom-event', (arg1, arg2, arg3) => {
    //
});
```

### `events`

All hap-server events will eventually reach the global `events` object.

```js
import {Events, events} from '@hap-server/hap-server';

events.on(Events.CharacteristicUpdateEvent, event => {
    // ...
});
```

### `CharacteristicUpdateEvent`

Emitted when a characteristic's value is changed.

- `Server`  
    The actual CharacteristicUpdateEvent is created by the Server's handleCharacteristicUpdate method, not by Characteristics.
    - `events`

#### `CharacteristicUpdateEvent.prototype.server`

The `Server` the Characteristic belongs to.

#### `CharacteristicUpdateEvent.prototype.accessory`

The `Accessory` the Characteristic belongs to.

#### `CharacteristicUpdateEvent.prototype.service`

The `Service` the Characteristic belongs to.

#### `CharacteristicUpdateEvent.prototype.characteristic`

The `Characteristic` that changed.

#### `CharacteristicUpdateEvent.prototype.value`

The characteristic's new value.

#### `CharacteristicUpdateEvent.prototype.old_value`

The characteristic's previous value.

### `AutomationTriggerEvent`

Emitted when someone wants to set a characteristic's value.

- `AutomationTrigger`
    - `Automations`
        - `Server`
            - `events`

#### `AutomationTriggerEvent.prototype.server`

The `Server` the automation group containing the trigger belongs to.

#### `AutomationTriggerEvent.prototype.automations`

The `Automations` container the trigger belongs to.

#### `AutomationTriggerEvent.prototype.trigger`

The `AutomationTrigger` that emitted this event.

#### `AutomationTriggerEvent.prototype.context`

The `context` object passed to `AutomationTrigger.prototype.trigger`.
