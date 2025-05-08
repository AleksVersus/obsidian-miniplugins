const { ItemView, Plugin, WorkspaceLeaf, setIcon, Modal } = require('obsidian');

// Определяем уникальный тип для нашего View
const RIGHT_STICKY_VIEW_TYPE = "right-sticky-view";

// Класс для нашего View на правой панели
class RightStickyView extends ItemView {
    plugin;
    contentContainer;

    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    // Тип View
    getViewType() {
        return RIGHT_STICKY_VIEW_TYPE;
    }

    // Текст, отображаемый в заголовке панели
    getDisplayText() {
        return "Sticky Notes";
    }

    // Иконка для панели (нужно выбрать одну из доступных в Obsidian, например 'sticky-note')
    getIcon() {
        return "lucide-sticky-note"; // Или другая подходящая иконка, например 'lucide-sticky-note'
    }

    // Вызывается при открытии View
    async onOpen() {
        this.contentContainer = this.containerEl.children[1]; // Получаем контейнер для контента
        this.contentContainer.empty(); // Очищаем предыдущее содержимое
        this.contentContainer.createEl("h4", { text: "Не забыть:" });
        const notesWrapper = this.contentContainer.createEl("div", {cls: "right-sticky-wrapper"});
        const notesBlock = notesWrapper.createEl("div", {cls: "right-sticky-notes-block"});
        // Получаем заметки, как данные из сохранённых данных плагина
        const notes = await this._readNotes();
        // Перебираем заметки и генерируем div для каждой из них, закидывая его в notesBlock
        this._fillNotesBlock(notes, notesBlock);

        this._addControls(notesWrapper);
    }

    // Вызывается при закрытии View
    async onClose() {
        // Очистка ресурсов, если необходимо
    }

    _addControls(notesWrapper) {
        const form = notesWrapper.createEl("form", {cls: "right-sticky-manage-block"});
        const head = form.createEl("input", {
            attr: {
                placeholder: "Заголовок",
                type: "text",
                name: "right-sticky-manage__head-value",
                id: "right-sticky-manage__head"
            }
        });
        const textarea = form.createEl('textarea', {
            attr: {
                placeholder: "Текст заметки.\n Enter — сохранить заметку, Shift + Enter — Новая строка.",
                id: "right-stiky-manage__body"
            }
        });
        const addButton = form.createEl('button', { 
            text: 'Добавить',
            attr: {
                type: "button",
                id: "right-sticky-manage__submit"
            }
        });
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();                  // отбросить вставку новой строки
                addButton.click();                   // имитировать клик по кнопке
            }
        });
        addButton.onclick = async () => {
            if (textarea.value.trim()) {
                await this._appendNote(head.value.trim(), textarea.value.trim());
                textarea.value = ''; // Очистить поле ввода
                head.value = '';
            }
        };
        form.addEventListener('submit', async (event) => {
            event.preventDefault(); // предотвращаем стандартное поведение
            if (textarea.value.trim()) {
                await this._appendNote(head.value.trim(), textarea.value.trim());
                textarea.value = ''; // Очистить поле ввода
                head.value = '';
            }
        });
    }

    async _appendNote(noteHead, noteBody) {
        let notes = await this._readNotes();
        let noteID = this._newNoteID();
        notes.push({ noteID, noteHead, noteBody });
        const notesBlocks = this.contentContainer.querySelectorAll(".right-sticky-notes-block");
        if (notes.length < 2) {notesBlocks[0].empty();};
        this._viewNote(notesBlocks[0], noteID, noteHead, noteBody);
        await this.plugin.saveData({ notes });
    }

    async _readNotes() {
        // Новый метод. Чтение заметок из файла данных плагина
        // Заметки являются объектами вида {noteHead: "Заголовок", noteBody: "текст заметки"}
        // заметки хранятся в виде списка однотипных объектов
        const { notes = [] } = (await this.plugin.loadData()) || { };
        return notes;
    }

    _fillNotesBlock(notes, notesBlock) {
        // закидывает в блок заметки. Очищаем:
        notesBlock.empty();
        // только если notes не пуст
        if (notes && notes.length > 0) {
            notes.forEach(noteObj => {
                const { noteID, noteHead, noteBody } = noteObj;
                this._viewNote(notesBlock, noteID, noteHead, noteBody);
            });
        } else {
            this._noteNot(notesBlock);
        }
    }

    _noteNot(notesBlock) {
        notesBlock.createEl("p", {text: "Заметок нет."});
    }

    _viewNote(notesBlock, noteID, noteHead, noteBody) {
        const noteOne = notesBlock.createEl("div", {
            cls: "right-sticky-note",
            attr: { id: `right_sticky_note_${noteID}` }
        });
        const headWrapper = noteOne.createEl("div", {cls: "right-sticky-note-head-wrapper"});
        headWrapper.createEl("h5", {text: noteHead, cls: "right-sticky-note__head"});
        const btns = headWrapper.createEl("div", {cls: "right-sticky-note__btns-block"});
        const editBtn = btns.createEl("div", {cls: "clickable-icon"});
        editBtn.onclick = async () => {
            const modal = new EditNoteModal(this.app, noteID, noteHead, noteBody, async (newHead, newBody) => {
                // Обновляем данные в хранилище
                await this._updateNote(noteID, newHead, newBody);
            });
            
            // Открываем модальное окно
            modal.open();
        }
        setIcon(editBtn, 'lucide-file-pen-line', 16);
        const delBtn = btns.createEl("div", {cls: "clickable-icon"});
        delBtn.onclick = async () => {
            // 1. Удаляем HRMLElement из списка
            this._hideNote(noteID);
            // 2. Элемент надо удалить из списка Note
            const notesCount = await this._delNote(noteID);
            // 3. Если записок нет, записываем "Заметок нет"
            if (!notesCount) {
                this._noteNot(notesBlock);
            }
        }
        setIcon(delBtn, 'lucide-trash-2', 16);
        noteOne.createEl("div", {text: noteBody, cls: "right-sticky-note__body"});
    }

    _hideNote(noteID) {
        const noteOne = document.getElementById(`right_sticky_note_${noteID}`);
        noteOne.remove();
    }

    async _delNote(noteID) {
        let notes = await this._readNotes();
        notes = notes.filter(note => note.noteID !== noteID);
        await this.plugin.saveData({ notes });
        return notes.length;
    }

    _newNoteID() {
        // Генерируем случайную строку из букв и цифр длиной 8 символов
        const length = 16;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < length; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    async _updateNote(noteID, newHead, newBody) {
        let notes = await this._readNotes();
        const index = notes.findIndex(note => note.noteID === noteID);
        
        if (index !== -1) {
            notes[index].noteHead = newHead;
            notes[index].noteBody = newBody;
            
            // Обновляем UI
            const noteEl = document.getElementById(`right_sticky_note_${noteID}`);
            if (noteEl) {
                const headEl = noteEl.querySelector('.right-sticky-note__head');
                const bodyEl = noteEl.querySelector('.right-sticky-note__body');
                
                if (headEl) headEl.textContent = newHead;
                if (bodyEl) bodyEl.textContent = newBody;
            }
            
            // Сохраняем изменения
            await this.plugin.saveData({ notes });
        }
    }
}

// И добавить новый класс:
class EditNoteModal extends Modal {
    constructor(app, noteID, noteHead, noteBody, onSubmit) {
        super(app);
        this.noteID = noteID;
        this.noteHead = noteHead;
        this.noteBody = noteBody;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        this.titleEl.setText('Редактировать заметку');
        this.contentEl.addClass('right-sticky-note__modal');
        
        // Заголовок
        const headInput = contentEl.createEl('input', {
            attr: {
                type: 'text',
                id: 'edit-note-head',
                value: this.noteHead
            }
        });
        
        // Текст заметки
        const bodyInput = contentEl.createEl('textarea', {
            attr: {
                id: 'edit-note-body',
                rows: '5'
            }
        });
        bodyInput.value = this.noteBody;
        
        // Кнопки
        const btnContainer = contentEl.createEl('div', {cls: 'edit-note-buttons'});
        
        const saveBtn = btnContainer.createEl('button', {text: 'Сохранить'});
        saveBtn.onclick = () => {
            this.onSubmit(headInput.value, bodyInput.value);
            this.close();
        };
        
        const cancelBtn = btnContainer.createEl('button', {text: 'Отмена'});
        cancelBtn.onclick = () => this.close();
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

class RightStyckyPlugin extends Plugin {
    async onload() {
        console.log('Загрузка Right Sticky Plugin...');

        // Регистрируем наш View
        this.registerView(
            RIGHT_STICKY_VIEW_TYPE,
            (leaf) => new RightStickyView(leaf, this)
        );

        // // Добавляем иконку на левую панель (ribbon) для активации View
        // // Это стандартный способ добавить кнопку для открытия панели
        // this.addRibbonIcon('sticky-note', 'Открыть Sticky Notes', () => {
        //     this.activateView()
        // })

        // Попробуем активировать View при загрузке, чтобы иконка появилась справа
        // Не всегда гарантирует появление иконки без клика, но стоит попробовать
        this.app.workspace.onLayoutReady(() => {
            this._activateView();
        });

        console.log('Right Sticky Plugin загружен.');
    }

    onunload() {
        console.log('Выгрузка Right Sticky Plugin...');
        // Убираем View из рабочего пространства
        this.app.workspace.detachLeavesOfType(RIGHT_STICKY_VIEW_TYPE);
    }

    // Функция для активации (открытия) нашего View в правой панели
    async _activateView() {
        // Проверяем, нет ли уже активных View нашего типа
        const existingLeaves = this.app.workspace.getLeavesOfType(RIGHT_STICKY_VIEW_TYPE)
        if (existingLeaves.length > 0) {
            // Если есть, просто делаем его активным
            this.app.workspace.revealLeaf(existingLeaves[0]);
            return;
        }

        // Если нет, получаем правую панель (если ее нет, она будет создана)
        const leaf = this.app.workspace.getRightLeaf(false)
        if (leaf) {
            // Привязываем наш View к этой панели
            await leaf.setViewState({
                type: RIGHT_STICKY_VIEW_TYPE,
                active: true,
            })
            // Показываем панель
            this.app.workspace.revealLeaf(leaf);
        }
    }
}

module.exports = RightStyckyPlugin;