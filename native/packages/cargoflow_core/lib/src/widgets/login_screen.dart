import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/session.dart';
import '../theme/tokens.dart';

/// Вход: одна учётная запись для обоих режимов данных; адрес сервера можно изменить.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.session, required this.appTitle, required this.appSubtitle});
  final SessionController session;
  final String appTitle;
  final String appSubtitle;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final _server = TextEditingController(text: widget.session.api.baseUrl);
  DataMode _mode = DataMode.real;
  bool _busy = false;
  bool _showServer = false;
  String? _error;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_server.text.trim() != widget.session.api.baseUrl) await widget.session.setServer(_server.text);
      await widget.session.login(email: _email.text, password: _password.text, mode: _mode);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: CF.primary, borderRadius: BorderRadius.circular(CF.radiusMd)),
                        child: const Icon(Icons.local_shipping_outlined, color: Colors.white),
                      ),
                      const SizedBox(width: 10),
                      Flexible(child: Text(widget.appTitle, style: t.titleLarge, overflow: TextOverflow.ellipsis)),
                    ]),
                    const SizedBox(height: 24),
                    Text('Вход', style: t.headlineSmall),
                    const SizedBox(height: 4),
                    Text(widget.appSubtitle, style: const TextStyle(color: CF.mutedForeground)),
                    const SizedBox(height: 20),
                    const Text('Режим данных', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 8),
                    SegmentedButton<DataMode>(
                      segments: const [
                        ButtonSegment(value: DataMode.demo, icon: Icon(Icons.science_outlined), label: Text('Демо-база')),
                        ButtonSegment(value: DataMode.real, icon: Icon(Icons.storage_outlined), label: Text('Реальная')),
                      ],
                      selected: {_mode},
                      onSelectionChanged: (s) => setState(() => _mode = s.first),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _mode == DataMode.demo ? 'Тестовые данные — можно экспериментировать' : 'Рабочие данные компании',
                      style: const TextStyle(fontSize: 12, color: CF.mutedForeground),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _email,
                      decoration: const InputDecoration(labelText: 'Email'),
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username, AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      validator: (v) => v == null || !v.contains('@') ? 'Введите email' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      decoration: const InputDecoration(labelText: 'Пароль'),
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      validator: (v) => v == null || v.isEmpty ? 'Введите пароль' : null,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: CF.dangerBg, borderRadius: BorderRadius.circular(CF.radiusMd)),
                        child: Text(_error!, style: const TextStyle(color: CF.danger)),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Войти'),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => setState(() => _showServer = !_showServer),
                      child: Text(_showServer ? 'Скрыть настройки сервера' : 'Сервер: ${widget.session.api.baseUrl}'),
                    ),
                    if (_showServer)
                      TextFormField(
                        controller: _server,
                        decoration: const InputDecoration(labelText: 'Адрес сервера CargoFlow', hintText: 'https://…'),
                        keyboardType: TextInputType.url,
                        validator: (v) => v == null || !RegExp(r'^https?://').hasMatch(v.trim()) ? 'Адрес начинается с http:// или https://' : null,
                      ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
