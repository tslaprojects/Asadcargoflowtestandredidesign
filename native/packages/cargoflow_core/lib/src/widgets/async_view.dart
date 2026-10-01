import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import 'common.dart';

/// Загрузка данных экрана: скелетон → данные / понятная ошибка с повтором.
/// 401 (сессия истекла или отозвана) передаётся в [onUnauthorized] — приложение возвращает на вход.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({super.key, required this.load, required this.builder, this.onUnauthorized, this.skeleton, this.refreshEvery});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final VoidCallback? onUnauthorized;
  final Widget? skeleton;
  final Duration? refreshEvery;

  @override
  State<AsyncView<T>> createState() => AsyncViewState<T>();
}

class AsyncViewState<T> extends State<AsyncView<T>> {
  T? _data;
  ApiException? _error;
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    reload();
    final every = widget.refreshEvery;
    if (every != null) {
      _timer = Timer.periodic(every, (_) {
        if (mounted && _error == null) reload(silent: true);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> reload({bool silent = false}) async {
    if (!silent) setState(() => _loading = _data == null);
    try {
      final d = await widget.load();
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.unauthorized) {
        widget.onUnauthorized?.call();
        return;
      }
      // При фоновом обновлении без сети оставляем последние данные
      if (silent && _data != null) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return widget.skeleton ?? const ListSkeleton();
    if (_error != null && _data == null) return ErrorView(message: _error!.message, onRetry: reload);
    return widget.builder(context, _data as T, reload);
  }
}
