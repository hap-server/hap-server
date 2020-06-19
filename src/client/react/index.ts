import {createContext} from 'react';
import Client from '../client';

export const ClientContext = createContext<Client | null>(null);

export * from './hooks';
