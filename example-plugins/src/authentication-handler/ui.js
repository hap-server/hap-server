
import accessoryui, {AuthenticatedUser} from '@hap-server/accessory-ui-api';

const AuthenticationHandlerComponent = {
    template: `<div class="authentication-handler authentication-handler-storage">
        <form @submit.prevent="authenticate">
            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-username'">Username</label>
                <div class="col-sm-9">
                    <input type="text" class="form-control form-control-sm" :id="_uid + '-username'"
                        v-model="username" :class="{'is-invalid': error && error.validation && error.username}"
                        :disabled="authenticating" @input="error && error.validation ? error.username = null : undefined" />
                    <div v-if="error && error.validation && error.username" class="invalid-feedback">{{ error.username }}</div>
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-password'">Password</label>
                <div class="col-sm-9">
                    <input type="password" class="form-control form-control-sm" :id="_uid + '-password'"
                        v-model="password" :class="{'is-invalid': error && error.validation && error.password}"
                        :disabled="authenticating" @input="error && error.validation ? error.password = null : undefined" />
                    <div v-if="error && error.validation && error.password" class="invalid-feedback">{{ error.password }}</div>
                </div>
            </div>

            <div class="form-group row">
                <label class="col-sm-3 col-form-label col-form-label-sm" :for="_uid + '-remember'"></label>
                <div class="col-sm-9">
                    <div class="custom-control custom-checkbox">
                        <input :id="_uid + '-remember'" v-model="remember" type="checkbox" class="custom-control-input" />
                        <label class="custom-control-label" :for="_uid + '-remember'">Remember me</label>
                    </div>
                </div>
            </div>

            <p v-if="error && !error.validation" class="form-text text-danger">{{ error.message || error }}</p>

            <div class="d-flex">
                <slot name="left-buttons" />
                <div class="flex-fill"></div>
                <button class="btn btn-default btn-sm" type="button" @click="$emit('close')">Cancel</button>
                <button class="btn btn-primary btn-sm" type="submit" :disabled="authenticating">Login</button>
            </div>
        </form>
    </div>`,
    props: ['connection'],
    data() {
        return {
            authenticating: false,
            error: null,

            username: '',
            password: '',
            remember: true,
        };
    },
    methods: {
        async authenticate() {
            if (this.authenticating) throw new Error('Already authenticating');
            this.authenticating = true;
            this.error = null;

            try {
                const user = await this.connection.send({
                    username: this.username,
                    password: this.password,
                    remember: this.remember,
                });

                if (!(user instanceof AuthenticatedUser)) {
                    throw new Error('user was not an AuthenticatedUser object');
                }

                this.$emit('user', user);
                this.$emit('close');
            } catch (err) {
                this.error = err;
            } finally {
                this.authenticating = false;
            }
        },
    },
    watch: {
        authenticating(authenticating) {
            this.$emit('authenticating', authenticating);
        },
    },
};

accessoryui.registerAuthenticationHandlerComponent('LocalStorage', AuthenticationHandlerComponent, 'Local users');
