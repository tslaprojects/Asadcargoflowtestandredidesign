import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../domain/format.dart';
import '../domain/statuses.dart';
import '../models/orders.dart';
import '../theme/tokens.dart';

/// Открыть документ: скачать с авторизацией и открыть в приложении ОС (просмотр PDF/фото).
Future<void> openDocument(BuildContext context, ApiClient api, DocumentItem doc) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    final bytes = await api.download('/api/documents/${doc.id}/download');
    final dir = await getTemporaryDirectory();
    final safe = doc.filename.replaceAll(RegExp(r'[^\w.\-а-яА-ЯёЁ ]'), '_');
    final file = File('${dir.path}${Platform.pathSeparator}${doc.id.substring(0, 8)}-$safe');
    await file.writeAsBytes(bytes, flush: true);
    if (Platform.isAndroid || Platform.isIOS) {
      await OpenFilex.open(file.path);
    } else if (!await launchUrl(Uri.file(file.path))) {
      messenger.showSnackBar(SnackBar(content: Text('Файл сохранён: ${file.path}')));
    }
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}

/// Список документов перевозки (пакет: CMR, счёт, упаковочный лист, POD, фото).
class DocumentList extends StatelessWidget {
  const DocumentList({super.key, required this.docs, required this.api});
  final List<DocumentItem> docs;
  final ApiClient api;

  static const core = ['CMR', 'INVOICE', 'PACKING_LIST', 'PROOF_OF_DELIVERY'];

  @override
  Widget build(BuildContext context) {
    final present = docs.map((d) => d.type).toSet();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 6, runSpacing: 6, children: [
        for (final t in core)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            decoration: BoxDecoration(
              color: present.contains(t) ? CF.successBg : null,
              border: Border.all(color: present.contains(t) ? CF.success.withValues(alpha: 0.3) : CF.border),
              borderRadius: BorderRadius.circular(CF.radiusSm),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(present.contains(t) ? Icons.check : Icons.remove, size: 13, color: present.contains(t) ? CF.success : CF.mutedForeground),
              const SizedBox(width: 3),
              Text(t == 'PROOF_OF_DELIVERY' ? 'POD' : documentLabel(t), style: TextStyle(fontSize: 12, color: present.contains(t) ? CF.success : CF.mutedForeground)),
            ]),
          ),
      ]),
      const SizedBox(height: 8),
      if (docs.isEmpty)
        const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Документов пока нет.', style: TextStyle(color: CF.mutedForeground)))
      else
        for (final d in docs)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(d.filename.toLowerCase().endsWith('.pdf') ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: CF.mutedForeground),
            title: Text(d.filename, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${documentLabel(d.type)} · ${Fmt.dateTime(d.createdAt)}'),
            trailing: const Icon(Icons.open_in_new, size: 18),
            onTap: () => openDocument(context, api, d),
          ),
    ]);
  }
}
