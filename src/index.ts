// Ensure styles are loaded by webpack
import '../style/index.css';

import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {IDocumentManager} from '@jupyterlab/docmanager';
import {IGCSFileBrowserFactory} from './jupyterlab_filebrowser/tokens';
import {DirListing} from './jupyterlab_filebrowser/listing';
import {GCSDrive} from './contents';

import {
  Clipboard,
  MainAreaWidget,
  ToolbarButton,
  WidgetTracker,
} from '@jupyterlab/apputils';

import {
  IStateDB,
} from '@jupyterlab/coreutils';

import {CommandRegistry} from '@phosphor/commands';

import {Launcher} from '@jupyterlab/launcher';

import {GCSFileBrowser} from './jupyterlab_filebrowser/browser';
import {GCSFileBrowserModel} from './jupyterlab_filebrowser/model';

import {IIconRegistry} from '@jupyterlab/ui-components';

const NAMESPACE = 'gcsfilebrowser';

async function activateGCSFileBrowser(
  app: JupyterFrontEnd,
  manager: IDocumentManager,
  factory: IGCSFileBrowserFactory,
  restorer: ILayoutRestorer
) {
  const drive = new GCSDrive(app.docRegistry);
  manager.services.contents.addDrive(drive);

  const browser = factory.createFileBrowser(NAMESPACE, {
    driveName: drive.name,
    refreshInterval: 300000
  });

  let widgets = browser.layout.iter();

  for (let item = widgets.next(); item; item = widgets.next()) {
    console.log(item);
    if (item instanceof DirListing) {
      let listing = <DirListing>item;

      listing.onItemOpened.connect(console.log)
    }
  }

  browser.model.addGCSDrive(drive);
  browser.addClass('jp-GCSFilebrowser');

  browser.title.iconClass = 'jp-GCSFilebrowserIcon jp-SideBar-tabIcon';
  browser.title.caption = 'Browse GCS';
  browser.id = 'gcs-filebrowser-widget';

  restorer.add(browser, NAMESPACE);
  app.shell.add(browser, 'left', {rank: 100});


  addCommands(app, factory);


}



/**
 * The command IDs used by the file browser plugin.
 */
namespace CommandIDs {
  export const copyGCSURI = 'gcsfilebrowser:copy-gcs-uri';
  export const del = 'gcsfilebrowser:delete';
}


function addCommands(
  app: JupyterFrontEnd,
  factory: IGCSFileBrowserFactory
) {

  const {commands} = app;
  const {tracker} = factory;

  commands.addCommand(CommandIDs.del, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.delete();
      }
    },
    iconClass: 'jp-CloseIcon',
    label: 'Delete',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copyGCSURI, {
    execute: () => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }

      return widget.model.manager.services.contents
        .getDownloadUrl(widget.selectedItems().next()!.path)
        .then(url => {
          Clipboard.copyToSystem(url);
        });
    },
    iconClass: 'jp-CopyIcon',
    label: 'Copy GCS URI (gs://)',
    mnemonic: 0
  });



  // matches anywhere on filebrowser
  // const selectorContent = '.jp-gcs-DirListing-content';
  // matches all filebrowser items
  // const selectorItem = '.jp-gcs-DirListing-item[data-isdir]';
  // matches only non-directory items
  const selectorNotDir = '.jp-gcs-DirListing-item[data-isdir="false"]';

  app.contextMenu.addItem({
    command: CommandIDs.copyGCSURI,
    selector: selectorNotDir,
    rank: 1
  });
  app.contextMenu.addItem({
    command: CommandIDs.del,
    selector: selectorNotDir,
    rank: 2
  });

}

/**
 * The JupyterLab plugin for the GCS Filebrowser.
 */
const GCSFileBrowserPlugin: JupyterFrontEndPlugin<void> = {
  id: 'gcsfilebrowser:drive',
  requires: [
    IDocumentManager,
    IGCSFileBrowserFactory,
    ILayoutRestorer
  ],
  activate: activateGCSFileBrowser,
  autoStart: true
};



/**
 * Activate the file browser factory provider.
 */
function activateFactory(
  app: JupyterFrontEnd,
  icoReg: IIconRegistry,
  docManager: IDocumentManager,
  state: IStateDB
): IGCSFileBrowserFactory {
  const {commands} = app;
  const tracker = new WidgetTracker<GCSFileBrowser>({namespace: NAMESPACE});
  const createFileBrowser = (
    id: string,
    options: IGCSFileBrowserFactory.IOptions = {}
  ) => {
    const model = new GCSFileBrowserModel({
      iconRegistry: icoReg,
      manager: docManager,
      driveName: options.driveName || '',
      refreshInterval: options.refreshInterval,
      state: options.state === null ? null : options.state || state
    });
    const widget = new GCSFileBrowser({
      id,
      model
    });

    // Add a launcher toolbar item.
    let launcher = new ToolbarButton({
      iconClassName: 'jp-AddIcon',
      onClick: () => {
        return Private.createLauncher(commands, widget);
      },
      tooltip: 'New Launcher'
    });
    widget.toolbar.insertItem(0, 'launch', launcher);

    // Track the newly created file browser.
    void tracker.add(widget);

    return widget;
  };
  const defaultBrowser = createFileBrowser(NAMESPACE);

  return {createFileBrowser, defaultBrowser, tracker};
}


/**
 * The default file browser factory provider.
 */
const factory: JupyterFrontEndPlugin<IGCSFileBrowserFactory> = {
  activate: activateFactory,
  id: 'gcsfilebrowser-extension:factory',
  provides: IGCSFileBrowserFactory,
  requires: [IIconRegistry, IDocumentManager, IStateDB]
};

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * Create a launcher for a given filebrowser widget.
   */
  export function createLauncher(
    commands: CommandRegistry,
    browser: GCSFileBrowser
  ): Promise<MainAreaWidget<Launcher>> {
    const {model} = browser;

    return commands
      .execute('launcher:create', {cwd: model.path})
      .then((launcher: MainAreaWidget<Launcher>) => {
        model.pathChanged.connect(() => {
          launcher.content.cwd = model.path;
        }, launcher);
        return launcher;
      });
  }
}

/**
 * Export the plugin as default.
 */
export default [factory, GCSFileBrowserPlugin];
export * from './jupyterlab_filebrowser/tokens';
