import messages from './messages.json';

/**
 *
 * @param msg
 * @param {...any} args
 * @returns
 */
export function t(msg: keyof typeof messages, ...args: unknown[]) {
    return new Function('p', 'return `' + messages[msg] + '`;')(args);
}
