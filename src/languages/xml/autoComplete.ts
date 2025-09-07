import * as vscode from 'vscode';

import { GuidCounter } from '../../features/guidCounter';
import * as text from '../../editor/text';
import { SymbolRegistry } from '../../data/symbols';

export function activate() {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'anno-xml', scheme: 'file' },
    {
      provideCompletionItems(document, position, token, context) {
        const [ nodeName, nodePath ] = text.getAutoCompletePath(document, position);

        if (!nodePath && !nodeName) {
          return [];
        }

        if ((nodeName === 'ModOps' && !nodePath)
          || (nodeName === 'Group' && (!nodePath || nodePath.endsWith('Group')))) {
          const add = new vscode.CompletionItem({
            label: `Add`,
            description: `Adds the content at the end insider of the selection.`,
          }, vscode.CompletionItemKind.Snippet);
          add.insertText = new vscode.SnippetString(`<ModOp Add="@$0">\n</ModOp>`);
          add.sortText = `12`;
          const remove = new vscode.CompletionItem({
            label: `Remove`,
            description: `Removes the selected elements.`,
          }, vscode.CompletionItemKind.Snippet);
          remove.sortText = `15`;
          remove.insertText = new vscode.SnippetString(`<ModOp Remove="@$0" />`);
          const append = new vscode.CompletionItem({
            label: `Append`,
            detail: ` aka addNextSibling`,
            description: `Adds the content after the selection.`,
          }, vscode.CompletionItemKind.Snippet);
          append.insertText = new vscode.SnippetString(`<ModOp Append="@$0">\n</ModOp>`);
          const prepend = new vscode.CompletionItem({
            label: `Prepend`,
            detail: ` aka addPreviousSibling`,
            description: `Adds the content before the selection.`,
          }, vscode.CompletionItemKind.Snippet);
          append.sortText = `13`;
          prepend.insertText = new vscode.SnippetString(`<ModOp Prepend="@$0">\n</ModOp>`);
          const replace = new vscode.CompletionItem({
            label: `Replace`,
            description: `Replaces the selected element.`,
          }, vscode.CompletionItemKind.Snippet);
          prepend.sortText = `14`;
          replace.insertText = new vscode.SnippetString(`<ModOp Replace="@$0">\n</ModOp>`);
          replace.sortText = `10`;
          const merge = new vscode.CompletionItem({
            label: `Merge`,
            description: `Adds the content, or replaces it if it already exists.`,
          }, vscode.CompletionItemKind.Snippet);
          merge.insertText = new vscode.SnippetString(`<ModOp Merge="@$0">\n</ModOp>`);
          merge.sortText = `11`;

          const include = new vscode.CompletionItem({
            label: `Include`,
            description: `Includes ModOps from another XML file.`
          }, vscode.CompletionItemKind.Snippet);
          include.insertText = new vscode.SnippetString(`<Include File="$0" />`);

          const group = new vscode.CompletionItem({
            label: `Group`,
            description: `Groups multiple ModOps.`
          }, vscode.CompletionItemKind.Snippet);
          group.insertText = new vscode.SnippetString(`<Group>\n  $0\n</Group>`);

          const asset = new vscode.CompletionItem({
            label: `Asset`,
            detail: ` template`,
            description: `Adds an asset using \`Template\`.`
          }, vscode.CompletionItemKind.Snippet);
          asset.insertText = new vscode.SnippetString(`<Asset>
  <Template>$0</Template>
  <Values>
    <Standard>
      <GUID></GUID>
      <Name></Name>
    </Standard>
  </Values>
</Asset>`);
          const baseAsset = new vscode.CompletionItem({
            label: `Asset`,
            detail: ` base asset`,
            description: `Adds an asset using \`BaseAssetGUID\`.`
          }, vscode.CompletionItemKind.Snippet);
          baseAsset.insertText = new vscode.SnippetString(`<Asset>
  <BaseAssetGUID>$0</BaseAssetGUID>
  <Values>
    <Standard>
      <GUID></GUID>
      <Name></Name>
    </Standard>
  </Values>
</Asset>`);
          return [ add, append, prepend, replace, merge, remove, include, group, asset, baseAsset ];
        }

        const xpath = nodePath?.startsWith('XPath');
        if (xpath && !(
          nodeName === 'GUID'
          || nodeName === 'Path' || nodeName === 'Content'
          || nodeName === 'Add' || nodeName === 'Remove'
          || nodeName === 'Append' || nodeName === 'Prepand')) {
          return [];
        }

        // TODO for now allow any tag
        // if (!nodePath.endsWith('.GUID')) {
        //   return [];
        // }

        GuidCounter.use(document.uri);

        const items: vscode.CompletionItem[] = [];

        if (!xpath) {
          items.push(...GuidCounter.getCompletionItems());
        }

        const symbols = SymbolRegistry.all();
        for (const symbol of symbols.values()) {
          SymbolRegistry.resolveTemplate(symbol);

          if (symbol.template === 'Sequence' ||
            symbol.template === 'Objective' ||
            symbol.template === 'Function' ||
            symbol.template === 'FunctionImmidiate' ||
            symbol.template === 'Decision' ||
            symbol.template === 'SelectObjectiveComponent' ||
            symbol.template === 'FunctionImmediate' ||
            symbol.template === 'SequenceCharNotif' ||
            symbol.template === 'QuestInteractionWindow' ||
            symbol.template === 'PositionMarker' ||
            symbol.template === 'CampaignQuestObject' ||
            symbol.template === 'VisualQuestObject' ||
            symbol.template === 'QuestLine' ||
            symbol.template === 'ProvinceStoryObject' ||
            symbol.template === 'Matcher' ||
            symbol.template === 'StateChecker' ||
            symbol.template === 'TextPool' ||
            symbol.template === 'VisualObject' ||
            symbol.template === 'Prop' ||
            symbol.template === 'Achievement'
          ) {
            continue;
          }

          const item = new vscode.CompletionItem({
            label: `${symbol.english||symbol.name}`,
            description: `${symbol.template}: ${symbol.guid} (${symbol.name})`
          }, vscode.CompletionItemKind.Snippet);
          item.insertText = symbol.guid;
          item.kind = vscode.CompletionItemKind.Value;
          items.push(item);
        }

        return items;
      }
    },
    // TODO disable > trigger until we have proper patch matching.
    // For now just allow it anywhere.
    // '>' // trigger characters
  );

  return provider;
}
