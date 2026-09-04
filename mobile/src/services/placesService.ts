import { apiFetch } from "./apiClient";

export type AddressPrediction = {
  description: string;
  placeId: string;
};

export const autocompleteAddress = (input: string, sessionToken: string) =>
  apiFetch<{ predictions: AddressPrediction[] }>(
    `/places/autocomplete?input=${encodeURIComponent(input)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
  );

export const fetchAddressDetails = (placeId: string, sessionToken: string) =>
  apiFetch<{ address: string | null }>(
    `/places/details?placeId=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
  );
