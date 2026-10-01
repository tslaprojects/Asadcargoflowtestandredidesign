/// Следующий шаг водителя — та же логика, что driverNextStep в веб-версии.
class DriverAction {
  const DriverAction.transition(this.to, this.label) : kind = DriverActionKind.transition;
  const DriverAction.location(this.label)
      : kind = DriverActionKind.location,
        to = null;
  const DriverAction.deliver(this.label)
      : kind = DriverActionKind.deliver,
        to = 'DELIVERED';

  final DriverActionKind kind;
  final String? to;
  final String label;
}

enum DriverActionKind { transition, location, deliver }

class DriverStep {
  const DriverStep({this.primary, this.secondary = const [], required this.hint});
  final DriverAction? primary;
  final List<DriverAction> secondary;
  final String hint;
}

const _actionLabels = <String, String>{
  'AT_LOADING': 'Я прибыл на загрузку',
  'LOADED': 'Груз загружен',
  'IN_TRANSIT': 'Начать перевозку',
  'AT_BORDER': 'Прибыл на границу',
  'CUSTOMS': 'Начать таможенное оформление',
  'BORDER_CLEARED': 'Граница пройдена',
  'AT_DELIVERY': 'Прибыл на разгрузку',
};

DriverAction _t(String from, String to) =>
    DriverAction.transition(to, from == 'BORDER_CLEARED' && to == 'IN_TRANSIT' ? 'Продолжить маршрут' : _actionLabels[to] ?? to);

DriverStep driverNextStep(String status) {
  switch (status) {
    case 'VEHICLE_ASSIGNED':
    case 'DRIVER_ASSIGNED':
      return const DriverStep(hint: 'Рейс готовится. Дождитесь подтверждения от диспетчера.');
    case 'WAITING_FOR_LOADING':
      return DriverStep(primary: _t(status, 'AT_LOADING'), hint: 'Езжайте на место загрузки. По прибытии нажмите кнопку.');
    case 'AT_LOADING':
      return DriverStep(primary: _t(status, 'LOADED'), hint: 'Проверьте груз, сделайте фото груза и пломбы.');
    case 'LOADED':
      return DriverStep(primary: _t(status, 'IN_TRANSIT'), hint: 'Груз загружен. Можно выезжать.');
    case 'IN_TRANSIT':
      return DriverStep(
        primary: const DriverAction.location('Обновить местоположение'),
        secondary: [_t(status, 'AT_BORDER'), _t(status, 'AT_DELIVERY')],
        hint: 'Отправляйте местоположение на остановках. Отметьте прибытие на границу или разгрузку.',
      );
    case 'AT_BORDER':
      return DriverStep(primary: _t(status, 'CUSTOMS'), hint: 'Вы на границе. Отметьте начало таможенного оформления.');
    case 'CUSTOMS':
      return DriverStep(primary: _t(status, 'BORDER_CLEARED'), hint: 'Идёт таможенное оформление.');
    case 'BORDER_CLEARED':
      return DriverStep(primary: _t(status, 'IN_TRANSIT'), hint: 'Граница пройдена. Продолжайте маршрут.');
    case 'AT_DELIVERY':
      return const DriverStep(primary: DriverAction.deliver('Груз доставлен'), hint: 'Выгрузите груз, приложите фото и подписанную CMR.');
    case 'DELIVERED':
      return const DriverStep(hint: 'Груз доставлен. Ожидаем подтверждения получения заказчиком.');
    case 'CLOSED':
      return const DriverStep(hint: 'Рейс завершён. Спасибо!');
    case 'DISPUTED':
      return const DriverStep(hint: 'По перевозке открыт спор. Следуйте указаниям диспетчера.');
    case 'ON_HOLD':
      return const DriverStep(hint: 'Перевозка приостановлена администратором.');
    case 'CANCELLED':
      return const DriverStep(hint: 'Рейс отменён.');
    default:
      return const DriverStep(hint: 'Рейс ещё не готов к выполнению.');
  }
}
