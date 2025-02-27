import * as React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import _ from 'lodash';
import compose from 'recompose/compose';

import IntlProvider from '../IntlProvider';
import withLocale from '../IntlProvider/withLocale';
import FileItem from './UploadFileItem';
import UploadTrigger from './UploadTrigger';
import { prefix, ajaxUpload, defaultProps, getUnhandledProps } from '../utils';
import { getFiles, guid } from './utils';
import { UploaderProps, FileType } from './Uploader.d';

type FileStatusType = 'inited' | 'uploading' | 'error' | 'finished';
interface FileProgressType {
  status?: FileStatusType;
  progress?: number;
}

interface UploaderState {
  fileList: FileType[];
  fileMap: { [fileKey: string]: FileProgressType };
}

class Uploader extends React.Component<UploaderProps, UploaderState> {
  static propTypes = {
    action: PropTypes.string,
    accept: PropTypes.string,
    autoUpload: PropTypes.bool,
    children: PropTypes.node,
    className: PropTypes.string,
    classPrefix: PropTypes.string,
    defaultFileList: PropTypes.array,
    fileList: PropTypes.array,
    data: PropTypes.object,
    multiple: PropTypes.bool,
    disabled: PropTypes.bool,
    disabledFileItem: PropTypes.bool,
    name: PropTypes.string,
    timeout: PropTypes.number,
    withCredentials: PropTypes.bool,
    headers: PropTypes.object,
    locale: PropTypes.object,
    listType: PropTypes.oneOf(['text', 'picture-text', 'picture']),
    shouldQueueUpdate: PropTypes.func,
    shouldUpload: PropTypes.func,
    onChange: PropTypes.func,
    onUpload: PropTypes.func,
    onReupload: PropTypes.func,
    onPreview: PropTypes.func,
    onError: PropTypes.func,
    onSuccess: PropTypes.func,
    onProgress: PropTypes.func,
    onRemove: PropTypes.func,
    maxPreviewFileSize: PropTypes.number,
    style: PropTypes.object,
    toggleComponentClass: PropTypes.elementType,
    renderFileInfo: PropTypes.func,
    removable: PropTypes.bool,
    fileListVisible: PropTypes.bool
  };
  static defaultProps = {
    autoUpload: true,
    timeout: 0,
    name: 'file',
    multiple: false,
    disabled: false,
    withCredentials: false,
    data: {},
    listType: 'text',
    removable: true,
    fileListVisible: true
  };

  inputRef: React.RefObject<any>;

  constructor(props) {
    super(props);
    const { defaultFileList = [] } = props;
    const fileList = defaultFileList.map(this.createFile);

    this.state = {
      fileList,
      fileMap: {}
    };
    this.inputRef = React.createRef();
  }

  // public API
  start(file?: FileType) {
    if (file) {
      this.handleUploadFile(file);
      return;
    }
    this.handleAjaxUpload();
  }

  getFileList(): FileType[] {
    const { fileList } = this.props;
    const { fileMap } = this.state;

    if (typeof fileList !== 'undefined') {
      return fileList.map(file => {
        return {
          ...file,
          ...fileMap[file.fileKey]
        };
      });
    }

    return this.state.fileList;
  }

  cleanInputValue() {
    if (this.inputRef.current) {
      this.inputRef.current.getInputInstance().value = '';
    }
  }

  handleRemoveFile = (fileKey: number | string) => {
    const { onChange, onRemove } = this.props;
    const fileList = this.getFileList();
    const file: any = _.find(fileList, f => f.fileKey === fileKey);
    const nextFileList = fileList.filter(f => f.fileKey !== fileKey);

    if (this.xhrs[file.fileKey] && this.xhrs[file.fileKey].readyState !== 4) {
      this.xhrs[file.fileKey].abort();
    }

    this.setState({ fileList: nextFileList });

    onRemove && onRemove(file);
    onChange && onChange(nextFileList);
  };

  handleUploadTriggerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { autoUpload, shouldQueueUpdate, onChange } = this.props;
    const fileList = this.getFileList();
    const files: File[] = getFiles(event);
    const newFileList: FileType[] = [];

    Array.from(files).forEach((file: File) => {
      newFileList.push({
        blobFile: file,
        name: file.name,
        status: 'inited',
        fileKey: guid()
      });
    });

    const nextFileList = [...fileList, ...newFileList];

    if (shouldQueueUpdate && shouldQueueUpdate(nextFileList, newFileList) === false) {
      this.cleanInputValue();
      return;
    }

    onChange && onChange(nextFileList);

    this.setState({ fileList: nextFileList }, () => {
      autoUpload && this.handleAjaxUpload();
    });
  };

  handleAjaxUpload() {
    const { shouldUpload } = this.props;
    const fileList = this.getFileList();
    fileList.forEach(file => {
      if (shouldUpload && shouldUpload(file) === false) {
        return;
      }

      if (file.status === 'inited') {
        this.handleUploadFile(file);
      }
    });

    this.cleanInputValue();
  }

  handleAjaxUploadSuccess = (file: FileType, response: object, event) => {
    const { onSuccess } = this.props;
    const nextFile: FileType = {
      ...file,
      status: 'finished',
      progress: 100
    };
    this.updateFileList(nextFile, () => {
      onSuccess && onSuccess(response, nextFile, event);
    });
  };

  handleAjaxUploadError = (file: FileType, status: object, event) => {
    const { onError } = this.props;
    const nextFile: FileType = {
      ...file,
      status: 'error'
    };
    this.updateFileList(nextFile, () => {
      onError && onError(status, nextFile, event);
    });
  };

  handleAjaxUploadProgress = (file: FileType, percent: number, event) => {
    const { onProgress } = this.props;
    const nextFile: FileType = {
      ...file,
      status: 'uploading',
      progress: percent
    };

    this.updateFileList(nextFile, () => {
      onProgress && onProgress(percent, nextFile, event);
    });
  };

  handleUploadFile = (file: FileType) => {
    const { name, action, headers, withCredentials, timeout, data, onUpload } = this.props;
    const xhr = ajaxUpload({
      name,
      timeout,
      headers,
      data,
      withCredentials,
      file: file.blobFile,
      url: action,
      onError: this.handleAjaxUploadError.bind(this, file),
      onSuccess: this.handleAjaxUploadSuccess.bind(this, file),
      onProgress: this.handleAjaxUploadProgress.bind(this, file)
    });

    this.updateFileList({
      ...file,
      status: 'uploading'
    });
    this.xhrs[file.fileKey] = xhr;

    onUpload && onUpload(file);
  };

  handleReupload = (file: FileType) => {
    const { onReupload, autoUpload } = this.props;
    autoUpload && this.handleUploadFile(file);
    onReupload && onReupload(file);
  };

  updateFileList(nextFile: FileType, callback?: () => void) {
    const fileList = this.getFileList();
    const nextFileList = fileList.map(file => {
      return file.fileKey === nextFile.fileKey ? nextFile : file;
    });

    const nextState: any = {
      fileList: nextFileList
    };

    if (nextFile.progress) {
      const { fileMap } = this.state;

      fileMap[nextFile.fileKey] = {
        progress: nextFile.progress,
        status: nextFile.status
      };

      nextState.fileMap = fileMap;
    }

    this.setState(nextState, callback);
  }
  createFile = (file: FileType) => {
    const { fileKey } = file;
    return {
      ...file,
      fileKey: fileKey || guid(),
      progress: 0
    };
  };

  addPrefix = (name: string) => prefix(this.props.classPrefix)(name);

  progressTimer: any; //IntervalID;
  xhrs = {};
  uploadTrigger = null;

  renderFileItems() {
    const {
      disabledFileItem,
      listType,
      onPreview,
      maxPreviewFileSize,
      renderFileInfo,
      removable
    } = this.props;
    const fileList = this.getFileList();

    return (
      <div key="items" className={this.addPrefix('file-items')}>
        {fileList.map((file, index) => (
          <FileItem
            key={file.fileKey || index}
            file={file}
            maxPreviewFileSize={maxPreviewFileSize}
            listType={listType}
            disabled={disabledFileItem}
            onPreview={onPreview}
            onReupload={this.handleReupload}
            onCancel={this.handleRemoveFile}
            renderFileInfo={renderFileInfo}
            removable={removable}
          />
        ))}
      </div>
    );
  }

  renderUploadTrigger() {
    const {
      name,
      multiple,
      disabled,
      accept,
      children,
      toggleComponentClass,
      ...rest
    } = this.props;

    const unhandled = getUnhandledProps(Uploader, rest);

    return (
      <UploadTrigger
        {...unhandled}
        name={name}
        key="trigger"
        multiple={multiple}
        disabled={disabled}
        accept={accept}
        ref={this.inputRef}
        onChange={this.handleUploadTriggerChange}
        componentClass={toggleComponentClass}
      >
        {children}
      </UploadTrigger>
    );
  }

  render() {
    const { classPrefix, className, listType, fileListVisible, locale, style } = this.props;
    const classes = classNames(classPrefix, this.addPrefix(listType), className);
    const renderList = [this.renderUploadTrigger()];

    if (fileListVisible) {
      renderList.push(this.renderFileItems());
    }

    if (listType === 'picture') {
      renderList.reverse();
    }

    return (
      <IntlProvider locale={locale}>
        <div className={classes} style={style}>
          {renderList}
        </div>
      </IntlProvider>
    );
  }
}

export default compose<any, UploaderProps>(
  withLocale<UploaderProps>(['Uploader']),
  defaultProps<UploaderProps>({
    classPrefix: 'uploader'
  })
)(Uploader);
