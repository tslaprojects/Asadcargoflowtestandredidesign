import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../domain/journey.dart';
import '../theme/tokens.dart';

/// Этапы рейса — главный визуальный элемент перевозки: выполнено, сейчас, далее, ожидается.
class JourneyView extends StatelessWidget {
  const JourneyView({super.key, required this.steps, this.halted = false, this.compact = false});
  final List<JourneyStep> steps;
  final bool halted;
  final bool compact;

  static const _stateLabel = {JourneyState.done: 'выполнено', JourneyState.current: 'сейчас', JourneyState.next: 'далее', JourneyState.pending: 'ожидается'};

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd.MM, HH:mm', 'ru');
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Semantics(
            label: '${steps[i].title}${steps[i].place != null ? ', ${steps[i].place}' : ''} — ${_stateLabel[steps[i].state]}',
            excludeSemantics: true,
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SizedBox(
                  width: 22,
                  child: Column(children: [
                    _Dot(state: steps[i].state, halted: halted),
                    if (i < steps.length - 1)
                      Expanded(
                        child: Container(
                          width: 2,
                          margin: const EdgeInsets.symmetric(vertical: 2),
                          color: steps[i].state == JourneyState.done ? CF.primary : CF.border,
                        ),
                      ),
                  ]),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: i == steps.length - 1 ? 0 : (compact ? 10 : 14)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text.rich(TextSpan(children: [
                        TextSpan(
                          text: steps[i].title,
                          style: TextStyle(
                            fontWeight: steps[i].state == JourneyState.current ? FontWeight.w600 : FontWeight.w400,
                            color: steps[i].state == JourneyState.pending ? CF.mutedForeground : CF.foreground,
                          ),
                        ),
                        if (steps[i].place != null) TextSpan(text: ' · ${steps[i].place}', style: const TextStyle(color: CF.mutedForeground)),
                      ])),
                      if (!compact && (steps[i].at != null || steps[i].state == JourneyState.current || steps[i].hint != null))
                        Text(
                          steps[i].state == JourneyState.current
                              ? (halted ? 'остановлено' : 'сейчас')
                              : steps[i].at != null
                                  ? fmt.format(steps[i].at!)
                                  : steps[i].hint ?? '',
                          style: const TextStyle(fontSize: 12, color: CF.mutedForeground),
                        ),
                    ]),
                  ),
                ),
              ]),
            ),
          ),
      ],
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.state, required this.halted});
  final JourneyState state;
  final bool halted;
  @override
  Widget build(BuildContext context) {
    final color = halted && state == JourneyState.current ? CF.delayed : CF.primary;
    return AnimatedContainer(
      duration: CF.complex,
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: state == JourneyState.done ? CF.primary : CF.card,
        border: Border.all(
          color: switch (state) {
            JourneyState.done || JourneyState.current => color,
            JourneyState.next => CF.primary.withValues(alpha: 0.6),
            JourneyState.pending => CF.borderStrong,
          },
          width: 2,
        ),
      ),
      child: switch (state) {
        JourneyState.done => const Icon(Icons.check, size: 12, color: Colors.white),
        JourneyState.current => Center(child: Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle))),
        _ => null,
      },
    );
  }
}
