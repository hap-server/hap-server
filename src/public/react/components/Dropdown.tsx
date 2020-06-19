import * as React from 'react';
import {bind} from '../util/decorators';
import uid from '../util/component-id';

export interface DropdownProps {
    children: React.ReactNode;
    disabled?: boolean; // || false
    label?: string | React.ReactNode; // || 'Menu'
    colour?: 'default' | 'dark'; // || 'default'
    type?: 'down' | 'up' | 'left' | 'right'; // || 'down'
    align?: 'left' | 'right'; // || 'left'
    button?: React.ReactNode;
    buttonClass?: string;
    menuClass?: string;
    onOpen?: () => void;
    onClose?: () => void;
}

interface DropdownState {
    open: boolean;
}

export default class Dropdown extends React.PureComponent<DropdownProps, DropdownState> {
    private _uid = uid();

    state = {
        open: false,
    };

    render() {
        return <div className={[
            'drop' + (this.props.type ?? 'down'),
            this.state.open ? 'show' : null,
        ].filter(c => c).join(' ')}>
            {this.props.button ?? this.renderButton()}

            <div className={[
                'dropdown-menu',
                this.state.open ? 'show' : null,
                this.props.align === 'right' ? 'dropdown-menu-right' : null,
                this.props.menuClass,
            ].filter(c => c).join(' ')} aria-labelledby={this._uid + '-dropdown'}>
                {this.props.children}
            </div>
        </div>;
    }

    renderButton() {
        return <button
            id={this._uid + '-dropdown'}
            className={[
                'btn', 'btn-sm', 'dropdown-toggle',
                'btn-' + (this.props.colour ?? 'default'),
                this.props.buttonClass,
            ].filter(c => c).join(' ')}
            type="button"
            data-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded={this.state.open ? 'true' : 'false'}
            disabled={this.props.disabled ?? false}
            onClick={this.toggle}
        >
            {this.props.label ?? 'Menu'}
        </button>;
    }

    @bind
    toggle() {
        this.setState(prevState => ({
            open: !prevState.open,
        }));
    }

    open() {
        this.setState({
            open: true,
        });
    }

    @bind
    close() {
        this.setState({
            open: false,
        });
    }

    componentDidUpdate(prevProps: Readonly<DropdownProps>, prevState: Readonly<DropdownState>) {
        if (this.state.open && !prevState.open) {
            document.body.addEventListener('click', this.close, true);
            this.props.onOpen?.();
        }
        if (!this.state.open && prevState.open) {
            document.body.removeEventListener('click', this.close);
            this.props.onClose?.();
        }
    }

    static getDerivedStateFromProps(props: Readonly<DropdownProps>, state: Readonly<DropdownState>) {
        if (props.disabled && state.open) {
            return {
                open: false,
            };
        }

        return null;
    }

    componentWillUnmount() {
        document.body.removeEventListener('click', this.close);
    }
}
