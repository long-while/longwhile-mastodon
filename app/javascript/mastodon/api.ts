import type {
  AxiosError,
  AxiosResponse,
  Method,
  RawAxiosRequestHeaders,
} from 'axios';
import axios from 'axios';
import LinkHeader from 'http-link-header';

import { getAccessToken } from './initial_state';
import ready from './ready';

export const getLinks = (response: AxiosResponse) => {
  const value = response.headers.link as string | undefined;

  if (!value) {
    return new LinkHeader();
  }

  return LinkHeader.parse(value);
};

const csrfHeader: RawAxiosRequestHeaders = {};

const setCSRFHeader = () => {
  const csrfToken = document.querySelector<HTMLMetaElement>(
    'meta[name=csrf-token]',
  );

  if (csrfToken?.content) {
    csrfHeader['X-CSRF-Token'] = csrfToken.content;
  }
};

export const updateCSRFToken = (token: string) => {
  csrfHeader['X-CSRF-Token'] = token;
  let meta = document.querySelector<HTMLMetaElement>('meta[name=csrf-token]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'csrf-token';
    document.head.appendChild(meta);
  }
  meta.content = token;
};

void ready(setCSRFHeader);

let activeAccountToken: string | null = null;

export const setActiveAccountToken = (token: string | null) => {
  activeAccountToken = token;
};

export const currentAuthorizationToken = () =>
  activeAccountToken ?? getAccessToken() ?? null;

const authorizationTokenFromInitialState = (
  fallback = true,
): RawAxiosRequestHeaders => {
  if (activeAccountToken && activeAccountToken.length > 0) {
    return {
      Authorization: `Bearer ${activeAccountToken}`,
    };
  }

  if (!fallback) {
    return {};
  }

  const accessToken = getAccessToken();

  if (!accessToken) return {};

  return {
    Authorization: `Bearer ${accessToken}`,
  };
};

// eslint-disable-next-line import/no-default-export
export default function api(withAuthorization = true) {
  const instance = axios.create({
    transitional: {
      clarifyTimeoutError: true,
    },
    headers: {
      ...csrfHeader,
      ...(withAuthorization ? authorizationTokenFromInitialState() : {}),
    },

    transformResponse: [
      function (data: unknown) {
        try {
          return JSON.parse(data as string) as unknown;
        } catch {
          return data;
        }
      },
    ],
  });

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      if (response.headers.deprecation) {
        console.warn(
          `Deprecated request: ${response.config.method} ${response.config.url}`,
        );
      }
      return response;
    },
    (error: AxiosError) => {
      return Promise.reject(error);
    },
  );

  return instance;
}

type ApiUrl = `v${1 | 2}/${string}`;
type RequestParamsOrData = Record<string, unknown>;

export async function apiRequest<ApiResponse = unknown>(
  method: Method,
  url: string,
  args: {
    signal?: AbortSignal;
    params?: RequestParamsOrData;
    data?: RequestParamsOrData;
    timeout?: number;
  } = {},
) {
  const { data } = await api().request<ApiResponse>({
    method,
    url: '/api/' + url,
    ...args,
  });

  return data;
}

export async function apiRequestGet<ApiResponse = unknown>(
  url: ApiUrl,
  params?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('GET', url, { params });
}

export async function apiRequestPost<ApiResponse = unknown>(
  url: ApiUrl,
  data?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('POST', url, { data });
}

export async function apiRequestPut<ApiResponse = unknown>(
  url: ApiUrl,
  data?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('PUT', url, { data });
}

export async function apiRequestDelete<ApiResponse = unknown>(
  url: ApiUrl,
  params?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('DELETE', url, { params });
}
