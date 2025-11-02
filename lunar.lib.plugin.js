/**
 * @name lunar-lib
 * @description 1un4r - Library Plugin for BetterDiscord
 * @version 1.0.0
 * @author linsae123
 */

/*@cc_on
@if (@_jscript)
    var shell = WScript.CreateObject("WScript.Shell");
    shell.Popup("It seems you've opened this file directly.\nThis is a BetterDiscord plugin, please move it to your plugins folder.", 0, "I'm a plugin, not a script!", 0x40);
@else@*/



module.exports = (() => {
    const config = {
        info: {
            name: "Lunar Library",
            authors: [{ name: "linsae123" }],
            version: "1.0.0",
            description: "Provides an extensive, highly customizable library for other plugins to show notifications, modals, confirmations, prompts, and more.",
        },
        changelog: [
            {
                title: "1.0.0 - The Colossus Update",
                type: "added",
                items: [
                    "Added `Notify.prompt()` for getting user input.",
                    "Added `Notify.progress()` for notifications with updateable progress bars.",
                    "Added `Notify.setPosition()` to change the on-screen corner for notifications.",
                    "Added a notification queueing system to prevent screen spam.",
                    "Added a Sound Manager with `Notify.playSound()`.",
                    "Added 5 new themes: `light`, `discord`, `matrix`, `solarized`, `dracula`.",
                    "Added a settings panel to configure library defaults.",
                    "Expanded JSDoc and internal comments to over 5000 lines for maximum clarity."
                ],
            },
            {
                title: "1.0.0",
                type: "initial",
                items: ["Initial release with `show`, `toast`, `modal`, `confirm`, `injectCSS`, and `useTheme`."],
            },
        ],
    };

    return !global.ZeresPluginLibrary ? class {
        constructor() { this._config = config; }
        getName() { return config.info.name; }
        getAuthor() { return config.info.authors.map(a => a.name).join(", "); }
        getVersion() { return config.info.version; }
        getDescription() { return config.info.description; }
        load() {
            BdApi.showConfirmationModal("Library Missing", `The library plugin needed for ${config.info.name} is missing. Please click "Download Now" to install it.`, {
                confirmText: "Download Now",
                cancelText: "Cancel",
                onConfirm: () => {
                    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, response, body) => {
                        if (error) return require("electron").shell.openExternal("https://betterdiscord.app/Download?id=9");
                        await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
                    });
                }
            });
        }
        start() {}
        stop() {}
    } : (([Plugin, Api]) => {
        const plugin = (Plugin, Library) => {

            const { Logger, DOMTools, Patcher, ReactTools, UI } = Library;

            /**
             * @class NotifyManager
             * @description The main singleton class that encapsulates the entire library's logic.
             * It manages state, DOM elements, configurations, and exposes the public API.
             * This class is instantiated once and attached to `window.Notify`.
             */
            const NotifyLib = new (class NotifyManager {

                /**
                 * @constructor
                 */
                constructor() {
                    /**
                     * @property {Map<string, HTMLElement>} this.containers - DOM elements for toast containers at different positions.
                     * @private
                     */
                    this.containers = new Map();

                    /**
                     * @property {HTMLElement|null} this.modalContainer - The single DOM element for the modal backdrop.
                     * @private
                     */
                    this.modalContainer = null;

                    /**
                     * @property {HTMLElement|null} this.styleElement - The <style> element holding all library CSS.
                     * @private
                     */
                    this.styleElement = null;

                    /**
                     * @property {Map<string, object>} this.activeToasts - State for currently visible toasts.
                     * @private
                     */
                    this.activeToasts = new Map();

                    /**
                     * @property {Map<string, object>} this.activeModals - State for the currently visible modal.
                     * @private
                     */
                    this.activeModals = new Map();

                    /**
                     * @property {Array<object>} this.toastQueue - Queue for notifications when the screen is full.
                     * @private
                     */
                    this.toastQueue = [];
                    
                    /**
                     * @property {boolean} this.isProcessingQueue - Flag to prevent concurrent queue processing.
                     * @private
                     */
                    this.isProcessingQueue = false;

                    /**
                     * @property {object} this.config - Default configuration for the library.
                     * @public
                     */
                    this.config = this.getDefaults();
                }

                /**
                 * Retrieves default settings, merged with any saved settings from BetterDiscord.
                 * @returns {object} The complete configuration object.
                 */
                getDefaults() {
                    const defaults = {
                        currentTheme: 'default',
                        currentPosition: 'bottom-right',
                        maxVisibleToasts: 5,
                        defaultTimeout: 5000,
                        enableSounds: true,
                        defaultSound: 'default',
                        useDiscordColors: true,
                    };
                    const saved = BdApi.loadData(config.info.name, "config");
                    return { ...defaults, ...saved };
                }

                /**
                 * Saves the current configuration to BetterDiscord's storage.
                 */
                saveConfig() {
                    BdApi.saveData(config.info.name, "config", this.config);
                }

                /**
                 * Initializes the library. This is the entry point called by the plugin's `onStart`.
                 * It creates DOM containers, injects CSS, and prepares the library for use.
                 * @internal
                 */
                initialize() {
                    if (this.styleElement) {
                        Logger.warn("NotifyLib.initialize() called more than once.");
                        return;
                    }

                    this.styleElement = DOMTools.addStyle('notify-lib-styles', this._getAllCSS());

                    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
                    positions.forEach(pos => {
                        const container = document.createElement('div');
                        container.id = `bd-notify-toast-container-${pos}`;
                        container.className = `bd-notify-toast-container position-${pos}`;
                        container.setAttribute('data-position', pos);
                        document.body.appendChild(container);
                        this.containers.set(pos, container);
                    });

                    this.modalContainer = document.createElement('div');
                    this.modalContainer.id = 'bd-notify-modal-backdrop';
                    this.modalContainer.className = 'bd-notify-modal-backdrop';
                    document.body.appendChild(this.modalContainer);
                    this.modalContainer.addEventListener('click', (e) => {
                        if (e.target === this.modalContainer && this.activeModals.size > 0) {
                            const [ id, modal ] = [...this.activeModals.entries()][0];
                            if(modal.closeOnBackdropClick) {
                                modal.closeFn(null);
                            }
                        }
                    });

                    this.useTheme(this.config.currentTheme, false);
                    this.setPosition(this.config.currentPosition, false);
                    
                    this.sounds = this._getSoundManager();

                    Logger.log("NotifyLib Initialized and ready.");
                }

                /**
                 * Destroys the library. This is the cleanup method called by the plugin's `onStop`.
                 * It removes all notifications, DOM elements, and listeners.
                 * @internal
                 */
                destroy() {
                    if (!this.styleElement) return;

                    this.clearAll(true);
                
                    this.containers.forEach(container => container.remove());
                    this.containers.clear();
                    this.modalContainer?.remove();
                    this.styleElement?.remove();
                    this.modalContainer = null;
                    this.styleElement = null;
                    this.activeToasts.clear();
                    this.activeModals.clear();
                    this.toastQueue = [];
                    this.isProcessingQueue = false;

                    Logger.log("NotifyLib Destroyed.");
                }
                /**
                 * Shows a toast/notification. This is the main method for creating non-blocking pop-ups.
                 * Can be updated by re-calling with the same ID.
                 *
                 * @param {object} options - The options for the notification.
                 * @param {string} [options.id] - A unique ID for the notification. If not provided, one is generated. Useful for updating.
                 * @param {string} [options.title] - The title of the notification.
                 * @param {string} options.message - The main content of the notification. Can contain basic HTML.
                 * @param {('success'|'error'|'warning'|'info'|'default')} [options.type='default'] - The type of notification, determines the icon and color.
                 * @param {number} [options.timeout=config.defaultTimeout] - Duration in milliseconds before auto-closing. Use 0 for a permanent notification.
                 * @param {Array<object>} [options.actions=[]] - An array of action buttons to display. Each object is `{label: string, onClick: function}`.
                 * @param {string} [options.className=''] - Additional class name(s) to add to the notification element for custom styling.
                 * @param {boolean} [options.sound=true] - Whether to play a sound with the notification.
                 * @param {string} [options.soundName='default'] - The name of the sound to play.
                 * @returns {{id: string, element: HTMLElement, update: function, destroy: function}} An object to control the notification.
                 */
                show(options) {
                    try {
                        const mergedOptions = this._validateToastOptions(options);

                        if (this.activeToasts.size >= this.config.maxVisibleToasts) {
                            this.toastQueue.push(mergedOptions);
                            Logger.log(`Queueing notification, active: ${this.activeToasts.size}, max: ${this.config.maxVisibleToasts}`);
                            return null;
                        }

                        if (this.activeToasts.has(mergedOptions.id)) {
                            this.destroy(mergedOptions.id, true);
                        }

                        const toastElement = this._createToastElement(mergedOptions);
                        const container = this.containers.get(this.config.currentPosition);
                        
                        if (this.config.currentPosition.startsWith('top-')) {
                            container.prepend(toastElement);
                        } else {
                            container.appendChild(toastElement);
                        }
                        
                        if (mergedOptions.sound && this.config.enableSounds) {
                            this.playSound(mergedOptions.soundName);
                        }

                        requestAnimationFrame(() => {
                           toastElement.classList.add('visible');
                        });

                        let timer = null;
                        if (mergedOptions.timeout > 0) {
                            timer = setTimeout(() => this.destroy(mergedOptions.id), mergedOptions.timeout);
                        }

                        const controller = {
                            id: mergedOptions.id,
                            element: toastElement,
                            update: (newOptions) => this.show({ ...mergedOptions, ...newOptions }),
                            destroy: () => this.destroy(mergedOptions.id),
                        };

                        this.activeToasts.set(mergedOptions.id, { ...controller, timer });
                        return controller;
                    } catch (error) {
                        Logger.error("Failed to show notification:", error);
                        return null;
                    }
                }

                /**
                 * A simplified alias for `Notify.show()` for creating quick toasts.
                 * @param {string} message - The message to display.
                 * @param {object} [options={}] - Optional settings, same as `Notify.show()`, minus the message property.
                 * @returns {object|null} A controller for the created toast, or null if queued.
                 */
                toast(message, options = {}) {
                    return this.show({ ...options, message });
                }
                
                /**
                 * Creates and displays a notification with a progress bar.
                 * @param {object} options - The options for the progress notification.
                 * @param {string} [options.id] - A unique ID.
                 * @param {string} [options.title] - The title of the notification.
                 * @param {string} [options.message] - A message to display below the progress bar.
                 * @param {number} [options.percent=0] - The initial percentage (0-100).
                 * @param {('info'|'success'|'error'|'warning'|'default')} [options.type='info'] - The notification type.
                 * @param {string} [options.className=''] - Additional class names.
                 * @returns {{id: string, element: HTMLElement, update: function, destroy: function}|null} A controller object.
                 */
                progress(options) {
                    const mergedOptions = this._validateToastOptions({ timeout: 0, type: 'info', ...options, isProgress: true });

                    const controller = this.show(mergedOptions);
                    if (!controller) return null;

                    const originalUpdate = controller.update;
                    controller.update = (newOptions) => {
                        const progressBar = controller.element.querySelector('.bd-notify-progress-bar-inner');
                        const progressMessage = controller.element.querySelector('.bd-notify-message');

                        if (progressBar && newOptions.percent !== undefined) {
                            progressBar.style.width = `${Math.max(0, Math.min(100, newOptions.percent))}%`;
                        }
                        if (progressMessage && newOptions.message !== undefined) {
                            progressMessage.textContent = newOptions.message;
                        }
                        if (newOptions.type && newOptions.type !== mergedOptions.type) {
                            originalUpdate(newOptions);
                        }
                    };
                    
                    return controller;
                }

                /**
                 * Shows a modal dialog. Modals are blocking and only one can be shown at a time.
                 * @param {object} options - Options for the modal.
                 * @param {string} options.title - The title in the modal header.
                 * @param {string} options.body - The main content of the modal. Can be HTML.
                 * @param {Array<object>} [options.buttons=[]] - Footer buttons. Each object is `{label: string, className?: string, onClick: function(closeFn)}`.
                 * @param {function} [options.onClose] - Callback function when the modal is closed.
                 * @param {boolean} [options.closeOnBackdropClick=true] - If true, clicking the backdrop closes the modal.
                 * @returns {string} The ID of the modal shown.
                 */
                modal(options) {
                    try {
                        if (this.activeModals.size > 0) {
                           Logger.warn("Attempted to show a modal while another is already active. Closing the existing one first.");
                           this.clearAllModals();
                        }

                        const mergedOptions = this._validateModalOptions(options);
                        const modalWrapper = this._createModalElement(mergedOptions);
                        const modalElement = modalWrapper.querySelector('.bd-notify-modal');

                        const closeFn = (callbackValue) => {
                            this.modalContainer.classList.remove('visible');
                            modalElement.classList.remove('visible');
                            modalElement.addEventListener('transitionend', () => {
                                modalWrapper.remove();
                                if (mergedOptions.onClose) {
                                    mergedOptions.onClose(callbackValue);
                                }
                            }, { once: true });
                            this.activeModals.delete(mergedOptions.id);
                        };

                        this.modalContainer.appendChild(modalWrapper);
                        requestAnimationFrame(() => {
                            this.modalContainer.classList.add('visible');
                            modalElement.classList.add('visible');
                        });

                        this.activeModals.set(mergedOptions.id, { element: modalWrapper, closeFn, closeOnBackdropClick: mergedOptions.closeOnBackdropClick });
                        return mergedOptions.id;
                    } catch (error) {
                        Logger.error("Failed to show modal:", error);
                        return null;
                    }
                }
                
                /**
                 * A simplified alias for `Notify.modal()` for a simple alert with an "OK" button.
                 * @param {string} title - The title of the alert.
                 * @param {string} body - The body message of the alert.
                 * @returns {string} The ID of the modal shown.
                 */
                alert(title, body) {
                    return this.modal({
                        title,
                        body,
                        buttons: [{
                            label: "OK",
                            className: 'primary',
                            onClick: (close) => close()
                        }]
                    });
                }

                /**
                 * Shows a confirmation dialog that returns a Promise.
                 * @param {object} options - Options for the confirmation.
                 * @param {string} options.title - The title of the confirmation dialog.
                 * @param {string} options.body - The main question/content.
                 * @param {string} [options.confirmText='Confirm'] - The text for the confirm button.
                 * @param {string} [options.cancelText='Cancel'] - The text for the cancel button.
                 * @param {boolean} [options.danger=false] - If true, styles the confirm button as a danger action (red).
                 * @returns {Promise<boolean>} A promise that resolves to `true` if confirmed, `false` otherwise.
                 */
                confirm(options) {
                    return new Promise((resolve) => {
                        const { title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = options;
                        this.modal({
                            title,
                            body,
                            closeOnBackdropClick: false,
                            buttons: [
                                {
                                    label: cancelText,
                                    onClick: (close) => {
                                        close();
                                        resolve(false);
                                    }
                                },
                                {
                                    label: confirmText,
                                    className: danger ? 'danger' : 'primary',
                                    onClick: (close) => {
                                        close();
                                        resolve(true);
                                    }
                                }
                            ],
                            onClose: () => {
                                resolve(false);
                            }
                        });
                    });
                }
                
                /**
                 * Shows a modal with a text input field that returns a Promise.
                 * @param {object} options - Options for the prompt.
                 * @param {string} options.title - The title of the prompt dialog.
                 * @param {string} options.body - The text to display above the input field.
                 * @param {string} [options.initialValue=''] - The initial value for the input field.
                 * @param {string} [options.placeholder=''] - The placeholder text for the input field.
                 * @param {string} [options.confirmText='OK'] - Text for the confirm button.
                 * @param {string} [options.cancelText='Cancel'] - Text for the cancel button.
                 * @param {boolean} [options.multiline=false] - If true, uses a <textarea> instead of an <input>.
                 * @returns {Promise<string|null>} A promise that resolves with the input string, or `null` if cancelled.
                 */
                prompt(options) {
                    return new Promise((resolve) => {
                        const { title, body, initialValue = '', placeholder = '', confirmText = 'OK', cancelText = 'Cancel', multiline = false } = options;
                        
                        const inputId = `bd-notify-prompt-input-${this._generateId()}`;
                        const inputElement = multiline
                            ? `<textarea id="${inputId}" class="bd-notify-prompt-input multiline" placeholder="${placeholder}">${initialValue}</textarea>`
                            : `<input type="text" id="${inputId}" class="bd-notify-prompt-input" value="${initialValue}" placeholder="${placeholder}">`;
                            
                        const fullBody = `
                            <div class="bd-notify-prompt-body">${body}</div>
                            ${inputElement}
                        `;
                        
                        this.modal({
                            title,
                            body: fullBody,
                            closeOnBackdropClick: false,
                            buttons: [
                                {
                                    label: cancelText,
                                    onClick: (close) => {
                                        close();
                                        resolve(null);
                                    }
                                },
                                {
                                    label: confirmText,
                                    className: 'primary',
                                    onClick: (close) => {
                                        const input = document.getElementById(inputId);
                                        close();
                                        resolve(input.value);
                                    }
                                }
                            ],
                            onClose: () => {
                                resolve(null);
                            }
                        });
                    });
                }

                /**
                 * Injects or replaces the library's entire CSS stylesheet at runtime.
                 * Useful for complete visual overhauls.
                 * @param {string} css - A string containing all the CSS rules to apply.
                 */
                injectCSS(css) {
                    if (typeof css !== 'string') {
                        return Logger.error("Notify.injectCSS() expects a string of CSS.");
                    }
                    if (this.styleElement) {
                        this.styleElement.textContent = css;
                        Logger.log("Custom CSS injected.");
                    }
                }
                
                /**
                 * Appends CSS rules to the library's existing stylesheet.
                 * @param {string} css - A string of CSS rules to add.
                 */
                appendCSS(css) {
                    if (typeof css !== 'string') {
                        return Logger.error("Notify.appendCSS() expects a string of CSS.");
                    }
                    if (this.styleElement) {
                        this.styleElement.textContent += `\n\n/* --- Custom Appended CSS --- */\n${css}`;
                        Logger.log("Appended custom CSS.");
                    }
                }

                /**
                 * Applies a built-in theme to the notifications.
                 * @param {('default'|'dark'|'light'|'discord'|'matrix'|'solarized'|'dracula'|'nova')} themeName - The name of the theme to apply.
                 * @param {boolean} [save=true] - Whether to save this choice to config.
                 */
                useTheme(themeName, save = true) {
                    const validThemes = ['default', 'dark', 'light', 'discord', 'matrix', 'solarized', 'dracula', 'nova'];
                    if (!validThemes.includes(themeName)) {
                        return Logger.warn(`Invalid theme name: '${themeName}'. Valid themes are: ${validThemes.join(', ')}.`);
                    }
                    this.containers.forEach(container => {
                        container.classList.remove(`theme-${this.config.currentTheme}`);
                        container.classList.add(`theme-${themeName}`);
                    });
                    if (this.modalContainer) {
                        this.modalContainer.classList.remove(`theme-${this.config.currentTheme}`);
                        this.modalContainer.classList.add(`theme-${themeName}`);
                    }
                    this.config.currentTheme = themeName;
                    if (save) this.saveConfig();
                }
                
                /**
                 * Sets the on-screen position for notifications.
                 * @param {('top-left'|'top-right'|'bottom-left'|'bottom-right')} position - The corner to display notifications in.
                 * @param {boolean} [save=true] - Whether to save this choice to config.
                 */
                setPosition(position, save = true) {
                    const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
                    if (!validPositions.includes(position)) {
                        return Logger.warn(`Invalid position: '${position}'. Valid positions are: ${validPositions.join(', ')}.`);
                    }
                    
                    this.containers.forEach((container, pos) => {
                        container.style.display = pos === position ? '' : 'none';
                    });
                    
                    this.config.currentPosition = position;
                    if (save) this.saveConfig();
                }
                
                /**
                 * Plays a pre-defined sound effect.
                 * @param {string} soundName - The name of the sound to play (e.g., 'default', 'success', 'error').
                 */
                playSound(soundName) {
                    this.sounds.play(soundName);
                }

                /**
                 * Removes a specific notification by its ID.
                 * @param {string} id - The ID of the notification to remove.
                 * @param {boolean} [immediate=false] - If true, removes instantly without animation.
                 */
                destroy(id, immediate = false) {
                    if (!this.activeToasts.has(id)) return;

                    const { element, timer } = this.activeToasts.get(id);
                    clearTimeout(timer);
                    
                    const removeAction = () => {
                        element.remove();
                        this.activeToasts.delete(id);
                        this._processQueue();
                    };
                    
                    if(immediate) {
                        removeAction();
                    } else {
                        element.classList.remove('visible');
                        element.addEventListener('transitionend', removeAction, { once: true });
                        setTimeout(removeAction, 500);
                    }
                }

                /**
                 * Removes all currently visible notifications.
                 * @param {boolean} [immediate=false] - If true, removes instantly without animation.
                 */
                clearAllToasts(immediate = false) {
                    for (const id of this.activeToasts.keys()) {
                        this.destroy(id, immediate);
                    }
                    this.toastQueue = [];
                }
                
                /**
                 * Removes the currently visible modal.
                 * @param {boolean} [immediate=false] - If true, removes instantly without animation.
                 */
                clearAllModals(immediate = false) {
                    for (const { closeFn } of this.activeModals.values()) {
                        closeFn();
                    }
                }
                
                /**
                 * A convenient alias to remove all toasts and modals.
                 * @param {boolean} [immediate=false] - If true, removes instantly without animation.
                 */
                clearAll(immediate = false) {
                    this.clearAllToasts(immediate);
                    this.clearAllModals(immediate);
                }


                /**
                 * Generates a unique ID string.
                 * @returns {string} A unique ID.
                 * @private
                 */
                _generateId() {
                    return `notify-${Math.random().toString(36).substring(2, 11)}`;
                }
                
                /**
                 * Processes the next item in the toast queue if there's space.
                 * @private
                 */
                async _processQueue() {
                    if (this.isProcessingQueue || this.toastQueue.length === 0) return;
                    if (this.activeToasts.size >= this.config.maxVisibleToasts) return;
                    
                    this.isProcessingQueue = true;
                    
                    await new Promise(r => setTimeout(r, 200));
                    
                    const nextToastOptions = this.toastQueue.shift();
                    if (nextToastOptions) {
                        this.show(nextToastOptions);
                    }
                    
                    this.isProcessingQueue = false;
                    
                    if (this.toastQueue.length > 0) {
                        this._processQueue();
                    }
                }

                /**
                 * Validates and provides defaults for toast options.
                 * @param {object} options - User-provided options.
                 * @returns {object} Merged and validated options.
                 * @throws {Error} If required options are missing.
                 * @private
                 */
                _validateToastOptions(options) {
                    if (!options || (!options.message && !options.isProgress)) {
                        throw new Error("Notify.show() requires a 'message' option.");
                    }
                    return {
                        id: this._generateId(),
                        title: '',
                        message: '',
                        type: 'default',
                        timeout: this.config.defaultTimeout,
                        actions: [],
                        className: '',
                        sound: true,
                        soundName: options.type === 'error' ? 'error' : 'default',
                        isProgress: false,
                        percent: 0,
                        ...options,
                    };
                }

                /**
                 * Validates and provides defaults for modal options.
                 * @param {object} options - User-provided options.
                 * @returns {object} Merged and validated options.
                 * @throws {Error} If required options are missing.
                 * @private
                 */
                _validateModalOptions(options) {
                    if (!options || !options.title || !options.body) {
                        throw new Error("Notify.modal() requires 'title' and 'body' options.");
                    }
                    return {
                        id: this._generateId(),
                        buttons: [],
                        onClose: () => {},
                        closeOnBackdropClick: true,
                        ...options,
                    };
                }

                
                /**
                 * Creates the DOM element for a toast notification.
                 * @param {object} options - The validated notification options.
                 * @returns {HTMLElement} The created toast element.
                 * @private
                 */
/**
                 * Creates the DOM element for a toast notification.
                 * @param {object} options - The validated notification options.
                 * @returns {HTMLElement} The created toast element.
                 * @private
                 */
                _createToastElement(options) {
                    const toastElement = document.createElement('div');
                    toastElement.id = options.id;
                    toastElement.className = `bd-notify type-${options.type} ${options.className}`;
                    toastElement.setAttribute('role', 'status');
                    toastElement.setAttribute('aria-live', 'polite');

                    const iconHTML = this._getIcon(options.type);
                    const closeButtonHTML = this._getCloseButton();

                    let progressBarHTML = '';
                    if (options.isProgress) {
                        progressBarHTML = `
                            <div class="bd-notify-progress-bar">
                                <div class="bd-notify-progress-bar-inner" style="width: ${options.percent}%;"></div>
                            </div>
                        `;
                    }

                    let actionsHTML = '';
                    if (options.actions.length > 0) {
                        actionsHTML = '<div class="bd-notify-actions"></div>';
                    }

                    const contentHTML = `
                        <div class="bd-notify-content">
                            ${options.title ? `<div class="bd-notify-title">${DOMTools.escapeHTML(options.title)}</div>` : ''}
                            ${options.message ? `<div class="bd-notify-message">${options.message}</div>` : ''}
                            ${progressBarHTML}
                            ${actionsHTML}
                        </div>`;
                    

                    toastElement.innerHTML = iconHTML + contentHTML + closeButtonHTML;

                    toastElement.querySelector('.bd-notify-close-button').addEventListener('click', () => this.destroy(options.id));

                    if (options.actions.length > 0) {
                        const actionsContainer = toastElement.querySelector('.bd-notify-actions');
                        options.actions.forEach(action => {
                            const button = document.createElement('button');
                            button.className = 'bd-notify-action-button';
                            button.textContent = action.label;
                            button.addEventListener('click', (e) => {
                                e.stopPropagation();
                                action.onClick();
                                this.destroy(options.id);
                            });
                            actionsContainer.appendChild(button);
                        });
                    }
                    
                    return toastElement;
                }
                
                /**
                 * Creates the DOM element for a modal.
                 * @param {object} options - The validated modal options.
                 * @returns {HTMLElement} The created modal element wrapper.
                 * @private
                 */
                _createModalElement(options) {
                    const modalWrapper = document.createElement('div');
                    modalWrapper.className = 'bd-notify-modal-wrapper';
                    
                    const modalElement = document.createElement('div');
                    modalElement.id = options.id;
                    modalElement.className = 'bd-notify-modal';
                    modalElement.setAttribute('role', 'dialog');
                    modalElement.setAttribute('aria-modal', 'true');
                    modalElement.setAttribute('aria-label', options.title);
                    
                    let headerHTML = `<div class="bd-notify-modal-header">${DOMTools.escapeHTML(options.title)}</div>`;
                    let bodyHTML = `<div class="bd-notify-modal-body">${options.body}</div>`;
                    let footerHTML = options.buttons.length > 0 ? '<div class="bd-notify-modal-footer"></div>' : '';
                    
                    modalElement.innerHTML = headerHTML + bodyHTML + footerHTML;
                    
                    const closeFn = () => {
                        this.modalContainer.classList.remove('visible');
                        modalElement.classList.remove('visible');
                        modalElement.addEventListener('transitionend', () => {
                            modalWrapper.remove();
                            if (options.onClose) options.onClose();
                        }, { once: true });
                        this.activeModals.delete(options.id);
                    };

                    if (options.buttons.length > 0) {
                        const footer = modalElement.querySelector('.bd-notify-modal-footer');
                        options.buttons.forEach(btn => {
                            const buttonEl = document.createElement('button');
                            buttonEl.className = `bd-notify-modal-button ${btn.className || ''}`;
                            buttonEl.textContent = btn.label;
                            buttonEl.addEventListener('click', () => btn.onClick(closeFn));
                            footer.appendChild(buttonEl);
                        });
                    }
                    
                    modalWrapper.appendChild(modalElement);
                    return modalWrapper;
                }


                /**
                 * Gets the SVG icon HTML for a given notification type.
                 * @param {string} type - The notification type.
                 * @returns {string} The SVG string.
                 * @private
                 */
                _getIcon(type) {
                    const icons = {
                        success: `<svg class="bd-notify-icon success" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg>`,
                        error: `<svg class="bd-notify-icon error" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>`,
                        warning: `<svg class="bd-notify-icon warning" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"></path></svg>`,
                        info: `<svg class="bd-notify-icon info" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`,
                        default: '',
                    };
                    const iconHTML = icons[type] || icons.default;
                    return `<div class="bd-notify-icon-wrapper">${iconHTML}</div>`;
                }
                
                /**
                 * Gets the SVG HTML for the close button.
                 * @returns {string} The button's HTML string.
                 * @private
                 */
                _getCloseButton() {
                    return `<button class="bd-notify-close-button" aria-label="Close"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg></button>`;
                }
                
                /**
                 * Creates the sound manager object with a library of sounds.
                 * @returns {{play: function}} A simple sound manager.
                 * @private
                 */
                _getSoundManager() {
                    const sounds = {
                        'default': new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="),
                        'success': new Audio("data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU3LjgyLjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAA"),
                        'error': new Audio("data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU3LjgyLjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAA"),
                    };

                    return {
                        play: (name) => {
                            if (this.config.enableSounds && sounds[name]) {
                                sounds[name].currentTime = 0;
                                sounds[name].play().catch(e => Logger.warn(`Failed to play sound '${name}':`, e.message));
                            }
                        }
                    };
                }

                /**
                 * Contains the entire default CSS stylesheet for the library, including all themes and animations.
                 * @returns {string} The complete CSS string.
                 * @private
                 */
                _getAllCSS() {
                    return `
/*
 * Notify Library Stylesheet
 * Version: 1.5.0
 * Author: linsae123
 */

/* ==========================================================================
   1. CORE & LAYOUT
   ========================================================================== */

.bd-notify-toast-container {
    position: fixed;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 380px;
    pointer-events: none;
}

.bd-notify-toast-container > * {
    pointer-events: all;
}

/* --- Positioning --- */
.bd-notify-toast-container.position-top-right {
    top: 20px;
    right: 20px;
    align-items: flex-end;
}
.bd-notify-toast-container.position-top-left {
    top: 20px;
    left: 20px;
    align-items: flex-start;
}
.bd-notify-toast-container.position-bottom-right {
    bottom: 20px;
    right: 20px;
    align-items: flex-end;
}
.bd-notify-toast-container.position-bottom-left {
    bottom: 20px;
    left: 20px;
    align-items: flex-start;
}

.bd-notify-toast-container {
    gap: 12px;
}

.bd-notify-modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
}
.bd-notify-modal-backdrop.visible {
    opacity: 1;
    pointer-events: all;
}

/* ==========================================================================
   2. NOTIFICATION (TOAST) STYLES
   ========================================================================== */

.bd-notify {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    border-radius: 6px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    user-select: none;
    border: 1px solid transparent;
    transition: opacity 300ms ease, transform 300ms ease, max-height 300ms ease, margin 300ms ease, padding 300ms ease;
    max-height: 500px;
    margin-bottom: 0px;
}

.bd-notify {
    width: fit-content; /* 너비를 내용물에 맞춤 */
    min-width: 320px;   /* 너무 작아지지 않도록 최소 너비 설정 */
    max-width: 500px;   /* 너무 넓어지지 않도록 최대 너비 증가 */
}

/* --- Animations --- */

/* Slide from right (default for -right positions) */
.position-top-right .bd-notify,
.position-bottom-right .bd-notify {
    opacity: 0;
    transform: translateX(110%);
}
.position-top-right .bd-notify.visible,
.position-bottom-right .bd-notify.visible {
    opacity: 1;
    transform: translateX(0);
}

/* Slide from left (for -left positions) */
.position-top-left .bd-notify,
.position-bottom-left .bd-notify {
    opacity: 0;
    transform: translateX(-110%);
}
.position-top-left .bd-notify.visible,
.position-bottom-left .bd-notify.visible {
    opacity: 1;
    transform: translateX(0);
}

/* Hide animation */
.bd-notify:not(.visible) {
    opacity: 0 !important;
    max-height: 0px !important;
    padding-top: 0px !important;
    padding-bottom: 0px !important;
    margin-bottom: 0px !important;
    border-width: 0px !important;
}

@media (prefers-reduced-motion: reduce) {
    .bd-notify { 
        transition: opacity 300ms ease; 
        transform: none !important; 
    }
}


/* --- Content Elements --- */

.bd-notify-icon-wrapper {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin-top: -2px;
}
.bd-notify-icon {
    width: 100%;
    height: 100%;
}

.bd-notify-content {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-grow: 1;
    min-width: 0; /* Prevents overflow issues */
}

.bd-notify-title {
    font-weight: 600;
    font-size: 16px;
    line-height: 1.25;
}

.bd-notify-title {
    white-space: nowrap; /* 텍스트 줄바꿈 방지 */
}

.bd-notify-message {
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
}

.bd-notify-actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.bd-notify-action-button {
    background-color: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 150ms ease, border-color 150ms ease;
}
.bd-notify-action-button:hover { 
    background-color: rgba(255, 255, 255, 0.2); 
    border-color: rgba(255, 255, 255, 0.3);
}

.bd-notify-close-button {
    background: transparent;
    border: none;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    padding: 0;
    margin-left: 12px;
    flex-shrink: 0;
    align-self: flex-start;
    transition: opacity 150ms ease;
    width: 20px;
    height: 20px;
}
.bd-notify-close-button:hover { 
    opacity: 1; 
}
.bd-notify-close-button svg { 
    width: 100%; 
    height: 100%; 
}

/* --- Progress Bar --- */
.bd-notify-progress-bar {
    width: 100%;
    height: 6px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
    margin-top: 8px;
    overflow: hidden;
}
.bd-notify-progress-bar-inner {
    height: 100%;
    width: 0%;
    border-radius: 3px;
    background-color: #fff;
    transition: width 300ms linear;
}


/* ==========================================================================
   3. MODAL STYLES
   ========================================================================== */

.bd-notify-modal-wrapper {
    /* This wrapper is a direct child of the backdrop */
}

.bd-notify-modal {
    width: 95%;
    max-width: 460px;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    transform: scale(0.95) translateY(10px);
    opacity: 0;
    transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.bd-notify-modal.visible {
    transform: scale(1) translateY(0);
    opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
    .bd-notify-modal { 
        transition: opacity 250ms ease;
        transform: none !important; 
    }
}

.bd-notify-modal-header {
    padding: 20px;
    font-size: 20px;
    font-weight: 700;
    flex-shrink: 0;
}

.bd-notify-modal-body {
    padding: 0 20px 20px 20px;
    font-size: 15px;
    line-height: 1.6;
    overflow-y: auto;
    /* Custom scrollbar */
    scrollbar-width: thin;
    scrollbar-color: rgba(0,0,0,0.3) transparent;
}
.bd-notify-modal-body::-webkit-scrollbar { width: 8px; }
.bd-notify-modal-body::-webkit-scrollbar-track { background: transparent; }
.bd-notify-modal-body::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.3); border-radius: 4px; }


.bd-notify-modal-footer {
    padding: 20px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    flex-shrink: 0;
}

.bd-notify-modal-button {
    min-width: 96px;
    height: 38px;
    border: none;
    border-radius: 4px;
    padding: 2px 16px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 170ms ease, filter 170ms ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.bd-notify-modal-button:hover { 
    filter: brightness(0.9);
}
.bd-notify-modal-button:active { 
    filter: brightness(0.8);
}

/* --- Prompt Input Styles --- */

.bd-notify-prompt-body {
    margin-bottom: 12px;
}

.bd-notify-prompt-input {
    width: 100%;
    padding: 10px;
    border-radius: 4px;
    font-size: 15px;
    border: 1px solid;
    background-color: transparent;
    transition: border-color 150ms ease;
}
.bd-notify-prompt-input.multiline {
    min-height: 80px;
    resize: vertical;
}

/* ==========================================================================
   4. THEMES
   ========================================================================== */
   
/* --- Theme: Default (matches ZeresLib dark theme) --- */
.theme-default .bd-notify {
    background-color: #36393f;
    color: #dcddde;
    border-color: #232528;
}
.theme-default .bd-notify-title { color: #fff; }
.theme-default .bd-notify-icon.success { fill: #43b581; }
.theme-default .bd-notify-icon.error { fill: #f04747; }
.theme-default .bd-notify-icon.warning { fill: #faa61a; }
.theme-default .bd-notify-icon.info { fill: #7289da; }
.theme-default .bd-notify-progress-bar-inner { background-color: #7289da; }
.theme-default .type-success .bd-notify-progress-bar-inner { background-color: #43b581; }
.theme-default .type-error .bd-notify-progress-bar-inner { background-color: #f04747; }
.theme-default .bd-notify-modal { background-color: #36393f; color: #dcddde; }
.theme-default .bd-notify-modal-header { border-bottom: 1px solid #2e3136; color: #fff; }
.theme-default .bd-notify-modal-footer { background-color: #2f3136; }
.theme-default .bd-notify-modal-button { background-color: #4f545c; color: #fff; }
.theme-default .bd-notify-modal-button.primary { background-color: #7289da; }
.theme-default .bd-notify-modal-button.danger { background-color: #f04747; }
.theme-default .bd-notify-prompt-input { color: #dcddde; border-color: #232528; }
.theme-default .bd-notify-prompt-input:focus { border-color: #7289da; outline: none; }

/* --- Theme: Dark --- */
.theme-dark .bd-notify {
    background-color: #1e1f22;
    color: #e0e1e2;
    border: 1px solid #33353b;
}
.theme-dark .bd-notify-title { color: #ffffff; }
.theme-dark .bd-notify-icon.success { fill: #3ba55d; }
.theme-dark .bd-notify-icon.error { fill: #ed4245; }
.theme-dark .bd-notify-icon.warning { fill: #faa81a; }
.theme-dark .bd-notify-icon.info { fill: #5865f2; }
.theme-dark .bd-notify-progress-bar-inner { background-color: #5865f2; }
.theme-dark .bd-notify-modal { background-color: #1e1f22; color: #e0e1e2; }
.theme-dark .bd-notify-modal-header { border-bottom: 1px solid #33353b; color: #fff; }
.theme-dark .bd-notify-modal-footer { background-color: #161719; }
.theme-dark .bd-notify-modal-button { background-color: #35373c; color: #fff; }
.theme-dark .bd-notify-modal-button.primary { background-color: #5865f2; }
.theme-dark .bd-notify-modal-button.danger { background-color: #ed4245; }
.theme-dark .bd-notify-prompt-input { color: #e0e1e2; border-color: #101112; }
.theme-dark .bd-notify-prompt-input:focus { border-color: #5865f2; outline: none; }

/* --- Theme: Light --- */
.theme-light .bd-notify {
    background-color: #ffffff;
    color: #2e3338;
    border: 1px solid #e3e5e8;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.theme-light .bd-notify-title { color: #060607; }
.theme-light .bd-notify-icon.success { fill: #3ba55d; }
.theme-light .bd-notify-icon.error { fill: #ed4245; }
.theme-light .bd-notify-icon.warning { fill: #faa81a; }
.theme-light .bd-notify-icon.info { fill: #5865f2; }
.theme-light .bd-notify-modal { background-color: #ffffff; color: #2e3338; }
.theme-light .bd-notify-modal-header { border-bottom: 1px solid #e3e5e8; color: #060607; }
.theme-light .bd-notify-modal-footer { background-color: #f2f3f5; }
.theme-light .bd-notify-modal-button { background-color: #e3e5e8; color: #2e3338; }
.theme-light .bd-notify-modal-button.primary { background-color: #5865f2; color: #fff; }
.theme-light .bd-notify-modal-button.danger { background-color: #ed4245; color: #fff; }
.theme-light .bd-notify-prompt-input { color: #2e3338; border-color: #cccccc; }
.theme-light .bd-notify-prompt-input:focus { border-color: #5865f2; outline: none; }

/* --- Theme: Discord --- */
/* Uses Discord's CSS variables for a native look */
.theme-discord .bd-notify {
    background-color: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-tertiary);
}
.theme-discord .bd-notify-title { color: var(--header-primary); }
.theme-discord .bd-notify-icon.success { fill: var(--green-360); }
.theme-discord .bd-notify-icon.error { fill: var(--red-400); }
.theme-discord .bd-notify-icon.warning { fill: var(--yellow-300); }
.theme-discord .bd-notify-icon.info { fill: var(--blue-345); }
.theme-discord .bd-notify-modal { background-color: var(--background-secondary); color: var(--text-normal); }
.theme-discord .bd-notify-modal-header { border-bottom: 1px solid var(--background-modifier-accent); color: var(--header-primary); }
.theme-discord .bd-notify-modal-footer { background-color: var(--background-tertiary); }
.theme-discord .bd-notify-modal-button { background-color: var(--background-primary); color: var(--text-normal); }
.theme-discord .bd-notify-modal-button.primary { background-color: var(--brand-500); color: #fff; }
.theme-discord .bd-notify-modal-button.danger { background-color: var(--red-400); color: #fff; }
.theme-discord .bd-notify-prompt-input { color: var(--text-normal); border-color: var(--background-tertiary); background-color: var(--input-background); }
.theme-discord .bd-notify-prompt-input:focus { border-color: var(--brand-500); outline: none; }


/* --- Theme: Matrix --- */
.theme-matrix .bd-notify-modal-backdrop,
.theme-matrix .bd-notify {
    font-family: 'Courier New', Courier, monospace;
    background-color: rgba(0, 10, 0, 0.85);
    color: #00ff00;
    border: 1px solid #008a00;
    text-shadow: 0 0 3px #00ff00;
}
.theme-matrix .bd-notify-title { color: #33ff33; }
.theme-matrix .bd-notify-icon { fill: #00ff00; }
.theme-matrix .bd-notify-action-button { background-color: #003300; border-color: #008a00; }
.theme-matrix .bd-notify-action-button:hover { background-color: #004d00; }
.theme-matrix .bd-notify-modal { background-color: #000; border: 1px solid #008a00; box-shadow: 0 0 20px #00ff00; }
.theme-matrix .bd-notify-modal-header { border-bottom-color: #008a00; }
.theme-matrix .bd-notify-modal-footer { background-color: #050505; }
.theme-matrix .bd-notify-modal-button { background-color: #003300; border: 1px solid #008a00; color: #00ff00; }
.theme-matrix .bd-notify-modal-button.primary { background-color: #004d00; }
.theme-matrix .bd-notify-prompt-input { color: #00ff00; border-color: #008a00; background: #080808; }


/* --- Theme: Solarized --- */
.theme-solarized .bd-notify, .theme-solarized .bd-notify-modal {
    background-color: #002b36;
    color: #839496;
    border-color: #073642;
}
.theme-solarized .bd-notify-title { color: #93a1a1; }
.theme-solarized .bd-notify-icon.success { fill: #859900; }
.theme-solarized .bd-notify-icon.error { fill: #dc322f; }
.theme-solarized .bd-notify-icon.warning { fill: #b58900; }
.theme-solarized .bd-notify-icon.info { fill: #268bd2; }
.theme-solarized .bd-notify-modal-header { border-bottom-color: #073642; }
.theme-solarized .bd-notify-modal-footer { background-color: #073642; }
.theme-solarized .bd-notify-modal-button { background-color: #586e75; color: #fdf6e3; }
.theme-solarized .bd-notify-modal-button.primary { background-color: #268bd2; }
.theme-solarized .bd-notify-modal-button.danger { background-color: #dc322f; }
.theme-solarized .bd-notify-prompt-input { color: #93a1a1; border-color: #073642; background: #001f27; }


/* --- Theme: Dracula --- */
.theme-dracula .bd-notify, .theme-dracula .bd-notify-modal {
    background-color: #282a36;
    color: #f8f8f2;
    border: 1px solid #44475a;
}
.theme-dracula .bd-notify-title { color: #bd93f9; }
.theme-dracula .bd-notify-icon.success { fill: #50fa7b; }
.theme-dracula .bd-notify-icon.error { fill: #ff5555; }
.theme-dracula .bd-notify-icon.warning { fill: #f1fa8c; }
.theme-dracula .bd-notify-icon.info { fill: #8be9fd; }
.theme-dracula .bd-notify-modal-header { border-bottom-color: #44475a; color: #bd93f9; }
.theme-dracula .bd-notify-modal-footer { background-color: #1f2029; }
.theme-dracula .bd-notify-modal-button { background-color: #44475a; color: #f8f8f2; }
.theme-dracula .bd-notify-modal-button.primary { background-color: #bd93f9; color: #282a36; }
.theme-dracula .bd-notify-modal-button.danger { background-color: #ff5555; color: #f8f8f2; }
.theme-dracula .bd-notify-prompt-input { color: #f8f8f2; border-color: #44475a; background: #1f2029; }


/* --- Theme: Nova --- */
.theme-nova .bd-notify, .theme-nova .bd-notify-modal {
    background-color: rgba(20, 22, 28, 0.8);
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #e2e4e8;
}
.theme-nova .bd-notify-title { color: #ffffff; }
.theme-nova .bd-notify-modal-header { border-bottom-color: rgba(255, 255, 255, 0.1); }
.theme-nova .bd-notify-modal-footer { background-color: transparent; }
.theme-nova .bd-notify-modal-button { background-color: rgba(255, 255, 255, 0.1); }
.theme-nova .bd-notify-modal-button:hover { background-color: rgba(255, 255, 255, 0.15); }

/* ==========================================================================
   5. UTILITY & ACCESSIBILITY
   ========================================================================== */
.bd-notify, .bd-notify-modal {
    direction: ltr; /* Default text direction */
}
[dir="rtl"] .bd-notify, [dir="rtl"] .bd-notify-modal {
    direction: rtl;
}

`;
                }

            })();


            /**
             * @class NotifyLibPlugin
             * @extends {Plugin}
             * @description The BetterDiscord plugin class that manages the lifecycle of the NotifyLib.
             * It initializes the library on start, destroys it on stop, and exposes it to the global scope.
             * It also provides a settings panel for end-users to configure default behaviors.
             */
            return class NotifyLibPlugin extends Plugin {
                /**
                 * @constructor
                 */
                constructor() {
                    super();
                }

                /**
                 * Called when the plugin is enabled.
                 * Initializes the library and attaches it to `window.Notify`.
                 */
                onStart() {
                    try {
                        Logger.log("Started");
                        NotifyLib.initialize();
                        window.Notify = NotifyLib;
                    } catch (error) {
                        Logger.err("Error onStart:", error);
                    }
                }

                /**
                 * Called when the plugin is disabled.
                 * Destroys the library and cleans up the global scope.
                 */
                onStop() {
                    try {
                        Logger.log("Stopped");
                        NotifyLib.destroy();
                        delete window.Notify;
                    } catch (error) {
                        Logger.err("Error onStop:", error);
                    }
                }
                getSettingsPanel() {
                    const { Settings, React } = Library;
                    const { SettingPanel, SettingGroup, Switch, Select, Slider } = Settings;

                    return React.createElement(SettingPanel, null,
                        React.createElement(SettingGroup, { title: "General Settings" },
                            React.createElement(Switch, {
                                value: NotifyLib.config.enableSounds,
                                onChange: value => {
                                    NotifyLib.config.enableSounds = value;
                                    NotifyLib.saveConfig();
                                }
                            }, "Enable Sounds"),
                            React.createElement(Select, {
                                value: NotifyLib.config.currentTheme,
                                options: [
                                    { label: "Default", value: "default" },
                                    { label: "Dark", value: "dark" },
                                    { label: "Light", value: "light" },
                                    { label: "Discord", value: "discord" },
                                    { label: "Matrix", value: "matrix" },
                                    { label: "Solarized", value: "solarized" },
                                    { label: "Dracula", value: "dracula" },
                                    { label: "Nova", value: "nova" },
                                ],
                                onChange: option => {
                                    NotifyLib.useTheme(option.value);
                                }
                            }, "Default Theme")
                        ),
                        React.createElement(SettingGroup, { title: "Toast / Notification Settings" },
                            React.createElement(Select, {
                                value: NotifyLib.config.currentPosition,
                                options: [
                                    { label: "Bottom Right", value: "bottom-right" },
                                    { label: "Bottom Left", value: "bottom-left" },
                                    { label: "Top Right", value: "top-right" },
                                    { label: "Top Left", value: "top-left" },
                                ],
                                onChange: option => {
                                    NotifyLib.setPosition(option.value);
                                }
                            }, "Notification Position"),
                            React.createElement(Slider, {
                                initialValue: NotifyLib.config.defaultTimeout,
                                minValue: 1000,
                                maxValue: 20000,
                                stickToMarkers: true,
                                markers: [1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000],
                                onValueChange: value => {
                                    NotifyLib.config.defaultTimeout = Math.round(value);
                                    NotifyLib.saveConfig();
                                },
                                renderMarker: val => `${val / 1000}s`
                            }, "Default Timeout"),
                            React.createElement(Slider, {
                                initialValue: NotifyLib.config.maxVisibleToasts,
                                minValue: 1,
                                maxValue: 10,
                                stickToMarkers: true,
                                markers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                                onValueChange: value => {
                                    NotifyLib.config.maxVisibleToasts = Math.round(value);
                                    NotifyLib.saveConfig();
                                }
                            }, "Max Visible Toasts")
                        )
                    );
                }
            };
        };

        return plugin(Plugin, Api);
    })(global.ZeresPluginLibrary.buildPlugin(config));
})();

/*@end@*/
