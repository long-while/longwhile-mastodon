import { connect } from 'react-redux';

import ColumnsArea from '../components/columns_area';

const mapStateToProps = state => ({
  columns: state.getIn(['settings', 'columns']),
  isModalOpen: !!state.get('modal').modalType,
  layout: state.getIn(['meta', 'layout']),
});

export default connect(mapStateToProps, null, null, { forwardRef: true })(ColumnsArea);
