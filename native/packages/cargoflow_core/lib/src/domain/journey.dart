import 'statuses.dart';

enum JourneyState { done, current, next, pending }

class JourneyStep {
  JourneyStep(this.key, this.title, this.state, {this.place, this.at, this.hint});
  final String key;
  final String title;
  JourneyState state;
  final String? place;
  final DateTime? at;
  final String? hint;
}

/// Этапы рейса: подготовка → загрузка → отправление → [граница → таможня] → разгрузка → получение
/// (порт journeySteps из веб-версии).
List<JourneyStep> journeySteps(
  String status, {
  String? pickupCity,
  String? borderCity,
  String? deliveryCity,
  List<(String status, DateTime at)> history = const [],
}) {
  final i = statusOrder.indexOf(status);
  DateTime? at(List<String> s) {
    for (final h in history) {
      if (s.contains(h.$1)) return h.$2;
    }
    return null;
  }

  JourneyState state(String doneFrom, List<String> currentIn) {
    if (currentIn.contains(status)) return JourneyState.current;
    return i >= 0 && i >= statusOrder.indexOf(doneFrom) ? JourneyState.done : JourneyState.pending;
  }

  final steps = <JourneyStep>[
    JourneyStep(
      'prep',
      'Подготовка рейса',
      state('WAITING_FOR_LOADING', ['CARRIER_SELECTED', 'CONTRACT_PENDING', 'CONTRACT_SIGNED', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED']),
      hint: 'договор, машина, водитель',
      at: at(['DRIVER_ASSIGNED', 'WAITING_FOR_LOADING']),
    ),
    JourneyStep('pickup', 'Загрузка', state('LOADED', ['WAITING_FOR_LOADING', 'AT_LOADING']), place: pickupCity, at: at(['LOADED'])),
    JourneyStep('departure', 'Отправление', state('IN_TRANSIT', ['LOADED']), at: at(['IN_TRANSIT'])),
    if (borderCity != null) ...[
      JourneyStep('border', 'Граница', state('CUSTOMS', ['AT_BORDER']), place: borderCity, at: at(['AT_BORDER'])),
      JourneyStep('customs', 'Таможня', state('BORDER_CLEARED', ['CUSTOMS']), at: at(['BORDER_CLEARED'])),
    ],
    JourneyStep('delivery', 'Разгрузка', state('DELIVERED', ['AT_DELIVERY']), place: deliveryCity, at: at(['AT_DELIVERY'])),
    JourneyStep('confirm', 'Получение подтверждено', state('CLOSED', ['DELIVERED']), at: at(['CLOSED'])),
  ];
  if (!steps.any((s) => s.state == JourneyState.current) && i > 0) {
    for (final s in steps) {
      if (s.state == JourneyState.pending) {
        s.state = JourneyState.next;
        break;
      }
    }
  }
  return steps;
}
