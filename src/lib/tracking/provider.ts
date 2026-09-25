/**
 * Источник геопозиций. В MVP позиции присылает водитель из браузера (Geolocation API).
 * Для подключения GPS-трекеров/телематики/внешних fleet-провайдеров реализуйте интерфейс
 * и сохраняйте точки через TrackingService.recordProviderPosition (source = GPS_PROVIDER).
 */
export type ProviderPosition = {
  externalVehicleId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recordedAt: Date;
};

export interface TrackingProvider {
  readonly name: string;
  /** Последние позиции по списку внешних идентификаторов ТС. */
  fetchPositions(externalVehicleIds: string[]): Promise<ProviderPosition[]>;
}

/** Заглушка: внешние провайдеры не подключены. */
export const noopTrackingProvider: TrackingProvider = {
  name: "none",
  async fetchPositions() {
    return [];
  },
};
