/**
 * Panel views shown outside the panel (the docs' figures, the kitchen sink)
 * have no host behind them. Importing this settles that once, before any
 * view asks for a connection; `useNoHost()` itself may run only once.
 */
import {useNoHost} from '../client.js';

useNoHost();
