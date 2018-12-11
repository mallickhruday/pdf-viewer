import { Component, Prop, Element, Event, EventEmitter, Watch, State } from '@stencil/core';
import { Config } from './viewer-configuration';
import { setViewerOptions } from './viewer-options';
import { Icons } from './icons';

@Component({
    tag: 'hive-pdf-viewer',
    styleUrl: 'pdf-viewer.scss',
    shadow: true,
    assetsDir: 'pdfjs-assets'
})
export class PdfViewer {

    @Element() element: HTMLElement;

    @Prop({ context: 'resourcesUrl' }) resourcesUrl: string;
    @Prop({ context: 'document' }) document: Document;
    @Prop({ context: 'window' }) window: Window | any;

    @Prop() src: string | Uint8Array;
    @Watch('src')
    srcChanged() {
        this.openPDF();
    }

    @Prop({mutable: true}) page: number = 1;
    @Watch('page')
    pageChanged(page) {
        this.currentPage = page;
        this.PDFViewerApplication.page = page;
    }

    @Event() pageChange: EventEmitter<number>;
    @Event() onLinkClick: EventEmitter<string>;

    @State() currentPage: number = 1;
    @State() scalePreset: 'page-fit' | 'page-width';

    viewerContainer: HTMLElement;
    localeElement: HTMLLinkElement;
    fontFaceStyleElement: HTMLStyleElement;

    get workerSrc() {
        return `${this.resourcesUrl}pdfjs-assets/pdf.worker.min.js`
    }

    get PDFJSLib() {
        return this.window['pdfjs-dist/build/pdf'];
    }
    set PDFJSLib(pdfjs) {
        this.window['pdfjs-dist/build/pdf'] = pdfjs;
    }

    get PDFViewerApplication() {
        return this.window['PDFViewerApplication'];
    }

    componentWillLoad() {
        this.addLocaleLink();
        this.addFontFaces();
    }

    componentDidLoad() {
        setTimeout(async () => {
            await this.loadPDFJSLib();
            await this.loadPDFJSViewer();
            if (this.window.webViewerLoad) {
                this.loadWebViewer();
            }
            else {
                setTimeout(async () => {
                    await this.loadPDFJSLib();
                    await this.loadPDFJSViewer();
                    this.loadWebViewer();
                })
            }
        })
    }

    componentDidUnload() {
        this.PDFViewerApplication.cleanup();
        this.PDFViewerApplication.close();
        if (this.PDFViewerApplication._boundEvents) {
            this.PDFViewerApplication.unbindWindowEvents();
        }
        const bus = this.PDFViewerApplication.eventBus;
        if (bus) {
            this.PDFViewerApplication.unbindEvents();
            for (const key in bus._listeners) {
                if (bus._listeners[key]) {
                    bus._listeners[key] = undefined;
                }
            }
        }
        this.PDFViewerApplication.eventBus = null;
        this.PDFViewerApplication.PDFViewer = null;
        this.window['PDFViewerApplication'] = null;
        this.PDFJSLib = null;
        this.localeElement.parentNode.removeChild(this.localeElement);
        this.fontFaceStyleElement.parentNode.removeChild(this.fontFaceStyleElement);
    }

    loadWebViewer() {
        this.window.webViewerLoad(Config(this.element.shadowRoot));
        setViewerOptions({
            workerSrc: this.workerSrc,
            defaultUrl: '',
            enableWebGL: true
        });
        this.PDFViewerApplication.isViewerEmbedded = true;
        this.addEventListeners();
        this.openPDF();
    }

    async loadPDFJSLib() {
        this.PDFJSLib = (await import('pdfjs-dist/build/pdf.min.js')).default;
        this.PDFJSLib.GlobalWorkerOptions.workerSrc = this.workerSrc;
    }

    async loadPDFJSViewer() {
        await import('../../../pdf.js/build/generic/web/viewer.js');
    }

    addLocaleLink() {
        if (!this.document.head.querySelector('link[type="application/l10n"]')) {
            const localeScript = this.document.createElement('link');
            localeScript.rel = 'resource';
            localeScript.type = 'application/l10n';
            localeScript.href = `${this.resourcesUrl}pdfjs-assets/locale/locale.properties`;
            this.localeElement = this.document.head.appendChild(localeScript);
        }
    }

    addFontFaces() {
        if (!this.document.head.querySelector('#pdfViewerFontFaces')) {
            const fontStyle = this.document.createElement('style');
            fontStyle.id = 'pdfViewerFontFaces';
            fontStyle.innerHTML = `
                @font-face {
                    font-family: 'PDFViewerCircular';
                    src: url('${this.resourcesUrl}pdfjs-assets/fonts/CircularStd-Book.woff') format('woff');
                    font-weight: 400;
                }
                @font-face {
                    font-family: 'PDFViewerCircular';
                    src: url('${this.resourcesUrl}pdfjs-assets/fonts/CircularStd-Medium.woff') format('woff');
                    font-weight: 500;
                }
            `;
            this.fontFaceStyleElement = this.document.head.appendChild(fontStyle);
        }
    }

    addEventListeners() {
        this.viewerContainer.addEventListener('pagechange', this.handlePageChange.bind(this));
        this.viewerContainer.addEventListener('scalechange', this.handleScaleChange.bind(this));

        this.element.shadowRoot
            .querySelector('#viewerContainer')
            .addEventListener('click', (e: any) => {
                e.preventDefault();
                const link = (e.target as any).closest('.linkAnnotation > a');
                if (link) {
                    const href = (e.target as any).closest('.linkAnnotation > a').href || '';
                    // Ignore internal links to the same document
                    if (href.indexOf(`${window.location.host}/#`) !== -1) {
                        return;
                    }
                    this.onLinkClick.emit(href);
                }
        });
    }

    openPDF() {
        if (this.src) {
            this.PDFViewerApplication.open(this.src);
        }
    }

    handlePageChange(e) {
        this.currentPage = e.pageNumber;
        this.pageChange.emit(e.pageNumber);
    }

    handleScaleChange(e) {
        if (e.presetValue === 'page-fit') {
            this.scalePreset = 'page-fit';
        }
        else if (e.presetValue === 'page-width') {
            this.scalePreset = 'page-width';
        }
        else {
            this.scalePreset = undefined;
        }
    }

    pageScaleToggle() {
        if (this.scalePreset === 'page-fit') {
            this.PDFViewerApplication.pdfViewer.currentScaleValue = 'page-width'
        }
        else {
            this.PDFViewerApplication.pdfViewer.currentScaleValue = 'page-fit'
        }
    }

    render() {
        return ([
            <div id="outerContainer">

                <div id="sidebarContainer">
                    <div id="toolbarSidebar" class="hidden">
                        <div class="splitToolbarButton toggled">
                            <button id="viewThumbnail" class="toolbarButton toggled" title="Show Thumbnails" tabindex="2"
                                data-l10n-id="thumbs">
                                <span data-l10n-id="thumbs_label">Thumbnails</span>
                            </button>
                            <button id="viewOutline" class="toolbarButton" title="Show Document Outline (double-click to expand/collapse all items)"
                                tabindex="3" data-l10n-id="document_outline">
                                <span data-l10n-id="document_outline_label">Document Outline</span>
                            </button>
                            <button id="viewAttachments" class="toolbarButton" title="Show Attachments" tabindex="4"
                                data-l10n-id="attachments">
                                <span data-l10n-id="attachments_label">Attachments</span>
                            </button>
                        </div>
                    </div>
                    <div id="sidebarContent">
                        <div id="thumbnailView">
                        </div>
                        <div id="outlineView" class="hidden">
                        </div>
                        <div id="attachmentsView" class="hidden">
                        </div>
                    </div>
                    <div id="sidebarResizer" class="hidden"></div>
                </div>

                <div id="mainContainer">
                    <div class="findbar hidden" id="findbar">
                        <div id="findbarInputContainer">
                            <input id="findInput" class="toolbarField" title="Find" placeholder="Find in document…" tabindex="91"
                                data-l10n-id="find_input"/>
                            <div class="splitToolbarButton">
                                <button id="findPrevious" class="toolbarButton findPrevious" title="Find the previous occurrence of the phrase"
                                    tabindex="92" data-l10n-id="find_previous">
                                    <span data-l10n-id="find_previous_label">Previous</span>
                                </button>
                                <div class="splitToolbarButtonSeparator"></div>
                                <button id="findNext" class="toolbarButton findNext" title="Find the next occurrence of the phrase"
                                    tabindex="93" data-l10n-id="find_next">
                                    <span data-l10n-id="find_next_label">Next</span>
                                </button>
                            </div>
                        </div>

                        <div hidden id="findbarOptionsOneContainer">
                            <input type="checkbox" id="findHighlightAll" class="toolbarField" tabindex="94"/>
                            <label htmlFor="findHighlightAll" class="toolbarLabel" data-l10n-id="find_highlight">Highlight all</label>
                            <input type="checkbox" id="findMatchCase" class="toolbarField" tabindex="95"/>
                            <label htmlFor="findMatchCase" class="toolbarLabel" data-l10n-id="find_match_case_label">Match case</label>
                        </div>
                        <div hidden id="findbarOptionsTwoContainer">
                            <input type="checkbox" id="findEntireWord" class="toolbarField" tabindex="96"/>
                            <label htmlFor="findEntireWord" class="toolbarLabel" data-l10n-id="find_entire_word_label">Whole words</label>
                        </div>

                        <div id="findbarMessageContainer">
                            <span id="findMsg" class="toolbarLabel"></span>
                            <span id="findResultsCount" class="toolbarLabel hidden"></span>
                        </div>
                    </div>

                    <div id="secondaryToolbar" class="secondaryToolbar hidden doorHangerRight">
                        <div id="secondaryToolbarButtonContainer">
                            <button id="secondaryPresentationMode" class="secondaryToolbarButton presentationMode visibleLargeView"
                                title="Switch to Presentation Mode" tabindex="51" data-l10n-id="presentation_mode">
                                <span data-l10n-id="presentation_mode_label">Presentation Mode</span>
                            </button>

                            <button id="secondaryOpenFile" class="secondaryToolbarButton openFile visibleLargeView" title="Open File"
                                tabindex="52" data-l10n-id="open_file">
                                <span data-l10n-id="open_file_label">Open</span>
                            </button>

                            <button id="secondaryPrint" class="secondaryToolbarButton print visibleMediumView" title="Print"
                                tabindex="53" data-l10n-id="print">
                                <span data-l10n-id="print_label">Print</span>
                            </button>

                            <button id="secondaryDownload" class="secondaryToolbarButton download visibleMediumView" title="Download"
                                tabindex="54" data-l10n-id="download">
                                <span data-l10n-id="download_label">Download</span>
                            </button>

                            <a href="#" id="secondaryViewBookmark" class="secondaryToolbarButton bookmark visibleSmallView"
                                title="Current view (copy or open in new window)" tabindex="55" data-l10n-id="bookmark">
                                <span data-l10n-id="bookmark_label">Current View</span>
                            </a>

                            <div class="horizontalToolbarSeparator visibleLargeView"></div>

                            <button id="firstPage" class="secondaryToolbarButton firstPage" title="Go to First Page" tabindex="56"
                                data-l10n-id="first_page">
                                <span data-l10n-id="first_page_label">Go to First Page</span>
                            </button>
                            <button id="lastPage" class="secondaryToolbarButton lastPage" title="Go to Last Page" tabindex="57"
                                data-l10n-id="last_page">
                                <span data-l10n-id="last_page_label">Go to Last Page</span>
                            </button>

                            <div class="horizontalToolbarSeparator"></div>

                            <button id="pageRotateCw" class="secondaryToolbarButton rotateCw" title="Rotate Clockwise" tabindex="58"
                                data-l10n-id="page_rotate_cw">
                                <span data-l10n-id="page_rotate_cw_label">Rotate Clockwise</span>
                            </button>
                            <button id="pageRotateCcw" class="secondaryToolbarButton rotateCcw" title="Rotate Counterclockwise"
                                tabindex="59" data-l10n-id="page_rotate_ccw">
                                <span data-l10n-id="page_rotate_ccw_label">Rotate Counterclockwise</span>
                            </button>

                            <div class="horizontalToolbarSeparator"></div>

                            <button id="cursorSelectTool" class="secondaryToolbarButton selectTool toggled" title="Enable Text Selection Tool"
                                tabindex="60" data-l10n-id="cursor_text_select_tool">
                                <span data-l10n-id="cursor_text_select_tool_label">Text Selection Tool</span>
                            </button>
                            <button id="cursorHandTool" class="secondaryToolbarButton handTool" title="Enable Hand Tool"
                                tabindex="61" data-l10n-id="cursor_hand_tool">
                                <span data-l10n-id="cursor_hand_tool_label">Hand Tool</span>
                            </button>

                            <div class="horizontalToolbarSeparator"></div>

                            <button id="scrollVertical" class="secondaryToolbarButton scrollModeButtons scrollVertical toggled"
                                title="Use Vertical Scrolling" tabindex="62" data-l10n-id="scroll_vertical">
                                <span data-l10n-id="scroll_vertical_label">Vertical Scrolling</span>
                            </button>
                            <button id="scrollHorizontal" class="secondaryToolbarButton scrollModeButtons scrollHorizontal"
                                title="Use Horizontal Scrolling" tabindex="63" data-l10n-id="scroll_horizontal">
                                <span data-l10n-id="scroll_horizontal_label">Horizontal Scrolling</span>
                            </button>
                            <button id="scrollWrapped" class="secondaryToolbarButton scrollModeButtons scrollWrapped" title="Use Wrapped Scrolling"
                                tabindex="64" data-l10n-id="scroll_wrapped">
                                <span data-l10n-id="scroll_wrapped_label">Wrapped Scrolling</span>
                            </button>

                            <div class="horizontalToolbarSeparator scrollModeButtons"></div>

                            <button id="spreadNone" class="secondaryToolbarButton spreadModeButtons spreadNone toggled" title="Do not join page spreads"
                                tabindex="65" data-l10n-id="spread_none">
                                <span data-l10n-id="spread_none_label">No Spreads</span>
                            </button>
                            <button id="spreadOdd" class="secondaryToolbarButton spreadModeButtons spreadOdd" title="Join page spreads starting with odd-numbered pages"
                                tabindex="66" data-l10n-id="spread_odd">
                                <span data-l10n-id="spread_odd_label">Odd Spreads</span>
                            </button>
                            <button id="spreadEven" class="secondaryToolbarButton spreadModeButtons spreadEven" title="Join page spreads starting with even-numbered pages"
                                tabindex="67" data-l10n-id="spread_even">
                                <span data-l10n-id="spread_even_label">Even Spreads</span>
                            </button>

                            <div class="horizontalToolbarSeparator spreadModeButtons"></div>

                            <button id="documentProperties" class="secondaryToolbarButton documentProperties" title="Document Properties…"
                                tabindex="68" data-l10n-id="document_properties">
                                <span data-l10n-id="document_properties_label">Document Properties…</span>
                            </button>
                        </div>
                    </div>

                    <div class="toolbar">
                        <div id="toolbarContainer">
                            <div id="toolbarViewer">
                                <div id="toolbarViewerLeft">
                                    <button id="sidebarToggle" class="toolbar-button" title="Toggle Sidebar" tabindex="11" data-l10n-id="toggle_sidebar">
                                        { Icons.Sidebar }
                                    </button>

                                    <div class="separator"></div>

                                    <div class="pager">
                                        <button class="toolbar-button prev" title="Previous Page" id="previous" tabindex="13" data-l10n-id="previous">
                                            { Icons.Arrow }
                                        </button>
                                        <input type="number" id="pageNumber" title="Page" value={this.currentPage}
                                            size={4} min="1" tabindex="15" data-l10n-id="page"/>
                                        <span id="numPages"></span>
                                        <button class="toolbar-button next" title="Next Page" id="next" tabindex="14" data-l10n-id="next">
                                            { Icons.Arrow }
                                        </button>
                                    </div>

                                    <div class="separator"></div>

                                    <button id="zoomOut" class="toolbar-button" title="Zoom Out" tabindex="21" data-l10n-id="zoom_out">
                                        { Icons.ZoomOut }
                                    </button>
                                    <button id="zoomIn" class="toolbar-button" title="Zoom In" tabindex="22" data-l10n-id="zoom_in">
                                        { Icons.ZoomIn }
                                    </button>

                                    <div class="separator"></div>

                                    <button class="toolbar-button" onClick={ () => this.pageScaleToggle()}>
                                        { this.scalePreset === 'page-fit' ? Icons.FitWidth : Icons.FitPage }
                                    </button>
                                </div>
                                <div id="toolbarViewerMiddle" class="hidden">
                                    <span id="scaleSelectContainer" class="dropdownToolbarButton">
                                        <select id="scaleSelect" title="Zoom" tabindex="23" data-l10n-id="zoom">
                                            <option id="pageAutoOption" title="" value="auto" selected data-l10n-id="page_scale_auto">Automatic
                                                Zoom</option>
                                            <option id="pageActualOption" title="" value="page-actual" data-l10n-id="page_scale_actual">Actual
                                                Size</option>
                                            <option id="pageFitOption" title="" value="page-fit" data-l10n-id="page_scale_fit">Page
                                                Fit</option>
                                            <option id="pageWidthOption" title="" value="page-width" data-l10n-id="page_scale_width">Page
                                                Width</option>
                                            <option id="customScaleOption" title="" value="custom" disabled hidden></option>
                                            <option title="" value="0.5" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 50 }'>50%</option>
                                            <option title="" value="0.75" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 75 }'>75%</option>
                                            <option title="" value="1" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 100 }'>100%</option>
                                            <option title="" value="1.25" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 125 }'>125%</option>
                                            <option title="" value="1.5" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 150 }'>150%</option>
                                            <option title="" value="2" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 200 }'>200%</option>
                                            <option title="" value="3" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 300 }'>300%</option>
                                            <option title="" value="4" data-l10n-id="page_scale_percent" data-l10n-args='{ "scale": 400 }'>400%</option>
                                        </select>
                                    </span>
                                </div>
                                <div id="toolbarViewerRight">
                                    <button id="viewFind" class="toolbar-button" title="Find in Document" tabindex="12" data-l10n-id="findbar">
                                        { Icons.Search }
                                    </button>
                                </div>

                                <div class="hidden">
                                    <button id="presentationMode" class="toolbarButton presentationMode hiddenLargeView" title="Switch to Presentation Mode"
                                        tabindex="31" data-l10n-id="presentation_mode">
                                        <span data-l10n-id="presentation_mode_label">Presentation Mode</span>
                                    </button>

                                    <button id="openFile" class="toolbarButton openFile hiddenLargeView" title="Open File"
                                        tabindex="32" data-l10n-id="open_file">
                                        <span data-l10n-id="open_file_label">Open</span>
                                    </button>

                                    <button id="print" class="toolbarButton print hiddenMediumView" title="Print" tabindex="33"
                                        data-l10n-id="print">
                                        <span data-l10n-id="print_label">Print</span>
                                    </button>

                                    <button id="download" class="toolbarButton download hiddenMediumView" title="Download"
                                        tabindex="34" data-l10n-id="download">
                                        <span data-l10n-id="download_label">Download</span>
                                    </button>
                                    <a href="#" id="viewBookmark" class="toolbarButton bookmark hiddenSmallView" title="Current view (copy or open in new window)"
                                        tabindex="35" data-l10n-id="bookmark">
                                        <span data-l10n-id="bookmark_label">Current View</span>
                                    </a>

                                    <button id="secondaryToolbarToggle" class="toolbarButton" title="Tools" tabindex="36"
                                        data-l10n-id="tools">
                                        <span data-l10n-id="tools_label">Tools</span>
                                    </button>
                                </div>
                            </div>
                            <div id="loadingBar">
                                <div class="progress">
                                    <div class="glimmer">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <menu type="context" id="viewerContextMenu">
                        <menuitem id="contextFirstPage" data-l10n-id="first_page">
                        </menuitem>
                        <menuitem id="contextLastPage" data-l10n-id="last_page">
                        </menuitem>
                        <menuitem id="contextPageRotateCw" data-l10n-id="page_rotate_cw">
                        </menuitem>
                        <menuitem id="contextPageRotateCcw" data-l10n-id="page_rotate_ccw">
                        </menuitem>
                    </menu>

                    <div ref={(el) => this.viewerContainer = el as HTMLElement} id="viewerContainer" tabindex="0">
                        <div id="viewer" class="pdfViewer"></div>
                    </div>

                    <div id="errorWrapper" hidden>
                        <div id="errorMessageLeft">
                            <span id="errorMessage"></span>
                            <button id="errorShowMore" data-l10n-id="error_more_info">
                                More Information
                            </button>
                            <button id="errorShowLess" data-l10n-id="error_less_info" hidden>
                                Less Information
                            </button>
                        </div>
                        <div id="errorMessageRight">
                            <button id="errorClose" data-l10n-id="error_close">
                                Close
                            </button>
                        </div>
                        <div class="clearBoth"></div>
                        <textarea id="errorMoreInfo" hidden readonly="readonly"></textarea>
                    </div>
                </div>

                <div id="overlayContainer" class="hidden">
                    <div id="passwordOverlay" class="container hidden">
                        <div class="dialog">
                            <div class="row">
                                <p id="passwordText" data-l10n-id="password_label">Enter the password to open this PDF file:</p>
                            </div>
                            <div class="row">
                                <input type="password" id="password" class="toolbarField"/>
                            </div>
                            <div class="buttonRow">
                                <button id="passwordCancel" class="overlayButton"><span data-l10n-id="password_cancel">Cancel</span></button>
                                <button id="passwordSubmit" class="overlayButton"><span data-l10n-id="password_ok">OK</span></button>
                            </div>
                        </div>
                    </div>
                    <div id="documentPropertiesOverlay" class="container hidden">
                        <div class="dialog">
                            <div class="row">
                                <span data-l10n-id="document_properties_file_name">File name:</span>
                                <p id="fileNameField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_file_size">File size:</span>
                                <p id="fileSizeField">-</p>
                            </div>
                            <div class="separator"></div>
                            <div class="row">
                                <span data-l10n-id="document_properties_title">Title:</span>
                                <p id="titleField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_author">Author:</span>
                                <p id="authorField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_subject">Subject:</span>
                                <p id="subjectField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_keywords">Keywords:</span>
                                <p id="keywordsField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_creation_date">Creation Date:</span>
                                <p id="creationDateField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_modification_date">Modification Date:</span>
                                <p id="modificationDateField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_creator">Creator:</span>
                                <p id="creatorField">-</p>
                            </div>
                            <div class="separator"></div>
                            <div class="row">
                                <span data-l10n-id="document_properties_producer">PDF Producer:</span>
                                <p id="producerField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_version">PDF Version:</span>
                                <p id="versionField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_page_count">Page Count:</span>
                                <p id="pageCountField">-</p>
                            </div>
                            <div class="row">
                                <span data-l10n-id="document_properties_page_size">Page Size:</span>
                                <p id="pageSizeField">-</p>
                            </div>
                            <div class="separator"></div>
                            <div class="row">
                                <span data-l10n-id="document_properties_linearized">Fast Web View:</span>
                                <p id="linearizedField">-</p>
                            </div>
                            <div class="buttonRow">
                                <button id="documentPropertiesClose" class="overlayButton"><span data-l10n-id="document_properties_close">Close</span></button>
                            </div>
                        </div>
                    </div>
                    <div id="printServiceOverlay" class="container hidden">
                        <div class="dialog">
                            <div class="row">
                                <span data-l10n-id="print_progress_message">Preparing document for printing…</span>
                            </div>
                            <div class="row">
                                <progress value="0" max="100"></progress>
                                <span data-l10n-id="print_progress_percent" data-l10n-args='{ "progress": 0 }' class="relative-progress">0%</span>
                            </div>
                            <div class="buttonRow">
                                <button id="printCancel" class="overlayButton"><span data-l10n-id="print_progress_close">Cancel</span></button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>,
            <div id="printContainer"></div>
        ])
    }
}
